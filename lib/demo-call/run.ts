// Core of the public judge call — pure and dependency-injected so it is testable
// without Next internals or a live DB. Order of operations is deliberate:
//   validate number → load invoice → reserve (all caps) → draft+approve → place.
// CALL-E is only reached inside the reservation callback, so a denied or invalid
// request never spends a credit. Reuses the shared script generator, CalleClient,
// and budget guard rather than reimplementing them.
import { generateCallScript, generateProposedTerms } from '../calls/generate-script'
import { validateDestination, phoneRejectionMessage } from './phone'
import { runGuardedDemoCall, denyMessage } from './budget'
import type { BudgetStore } from './budget'
import type { CalleClient } from '../calle/types'

export interface DemoInvoice {
  id: string
  user_id: string
  client_name: string
  amount: number
  currency: string
  due_date: string
  language_preference: string | null
}

/** DB writes the run needs, injected so the action wires Supabase and tests spy. */
export interface DemoCallSink {
  createApprovedArrangement(invoice: DemoInvoice, proposedTerms: string): Promise<{ id: string }>
  insertCallRow(invoice: DemoInvoice, calleCallId: string): Promise<{ id: string }>
}

export interface DemoCallDeps {
  budget: number
  ipHash: string
  store: BudgetStore
  calle: CalleClient
  getInvoice(id: string): Promise<DemoInvoice | null>
  sink: DemoCallSink
}

export interface DemoCallInput {
  invoiceId: string
  phone: string
  region?: string
}

export type DemoCallResult =
  | {
      ok: true
      calleCallId: string
      callRowId: string
      arrangementId: string
      masked: string
      region: string
      remaining: number | null
    }
  | { ok: false; kind: 'validation' | 'not_found' | 'budget'; reason?: string; message: string }

function dueDaysOf(dueDate: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000))
}

export async function runDemoCall(deps: DemoCallDeps, input: DemoCallInput): Promise<DemoCallResult> {
  // 1. Validate + derive the destination server-side (never trust claimed region).
  const v = validateDestination(input.phone, input.region)
  if (!v.ok) return { ok: false, kind: 'validation', reason: v.reason, message: phoneRejectionMessage(v.reason) }

  // 2. Load the invoice by id (the only invoice detail we trust from the client).
  //    A read, gated before the credit-consuming reservation so a bad id wastes nothing.
  const invoice = await deps.getInvoice(input.invoiceId)
  if (!invoice) return { ok: false, kind: 'not_found', message: 'Invoice not found.' }

  const dueDays = dueDaysOf(invoice.due_date)
  const forScript = {
    clientName: invoice.client_name,
    amount: invoice.amount,
    currency: invoice.currency,
    dueDays,
  }
  const agentScript = generateCallScript(forScript, v.region)
  const proposedTerms = generateProposedTerms(forScript, v.region)

  // 3–5. Reserve under all caps; CALL-E is touched ONLY if the reservation is granted.
  const { reservation, placed } = await runGuardedDemoCall(
    deps.store,
    { ipHash: deps.ipHash, destinationMasked: v.masked, region: v.region, budget: deps.budget },
    async (reservationId) => {
      const arrangement = await deps.sink.createApprovedArrangement(invoice, proposedTerms)
      const place = await deps.calle.placeCall({
        toPhone: v.e164,
        toRegion: v.region,
        language: invoice.language_preference ?? 'en',
        agentScript,
        metadata: {
          invoiceId: invoice.id,
          invoiceAmount: invoice.amount,
          currency: invoice.currency,
          clientName: invoice.client_name,
          dueDays,
        },
      })
      const callRow = await deps.sink.insertCallRow(invoice, place.callId)
      await deps.store.finalize(reservationId, 'placed', place.callId, null)
      return { calleCallId: place.callId, callRowId: callRow.id, arrangementId: arrangement.id }
    },
  )

  if (!reservation.allowed || !placed) {
    const reason = reservation.reason ?? 'rate_limited'
    return { ok: false, kind: 'budget', reason, message: denyMessage(reason) }
  }

  return {
    ok: true,
    calleCallId: placed.calleCallId,
    callRowId: placed.callRowId,
    arrangementId: placed.arrangementId,
    masked: v.masked,
    region: v.region,
    remaining: reservation.remaining ?? null,
  }
}
