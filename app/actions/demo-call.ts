'use server'

// Server actions for the public judge call flow. Everything sensitive is derived
// server-side; the client is trusted only for an invoice id and a phone number.
// The CALL-E key is never sent to the client. Reuses the demo-call core (run.ts),
// the shared script generator, CalleClient, and the data-layer budget guard.
import { headers } from 'next/headers'
import { createHash } from 'node:crypto'
import { createSupabaseServer, queryTimeout } from '@/lib/supabase/server'
import { getCalleClient } from '@/lib/calle'
import { mapCalleOutcome } from '@/lib/calls/outcome-map'
import { generateCallScript } from '@/lib/calls/generate-script'
import { validateDestination, phoneRejectionMessage } from '@/lib/demo-call/phone'
import { demoCallBudget, supabaseBudgetStore } from '@/lib/demo-call/budget'
import { runDemoCall } from '@/lib/demo-call/run'
import type { DemoInvoice } from '@/lib/demo-call/run'

async function clientIpHash(): Promise<string> {
  const h = await headers()
  const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim()
  const salt = process.env.DEMO_IP_SALT ?? 'calle-demo-ip-salt-v1'
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

async function loadInvoice(id: string): Promise<DemoInvoice | null> {
  const supabase = createSupabaseServer()
  const { data, error } = await supabase
    .from('invoices')
    .select('id, user_id, client_name, amount, currency, due_date, language_preference')
    .eq('id', id)
    .abortSignal(queryTimeout())
    .single()
  if (error || !data) return null
  return data as DemoInvoice
}

function dueDays(dueDate: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000))
}

export interface BudgetView {
  total: number
  used: number
  remaining: number
}

export async function getBudget(): Promise<BudgetView> {
  const supabase = createSupabaseServer()
  const store = supabaseBudgetStore(supabase)
  return store.snapshot(demoCallBudget())
}

function callMode(): 'mock' | 'live' {
  return process.env.CALLE_MODE === 'live' ? 'live' : 'mock'
}

/** Mode + budget for the panel, so the UI can be honest about mock vs live. */
export async function getDemoCallInfo(): Promise<{ mode: 'mock' | 'live'; budget: BudgetView }> {
  return { mode: callMode(), budget: await getBudget() }
}

export type DraftResult =
  | { ok: true; script: string; masked: string; region: string; budget: BudgetView }
  | { ok: false; message: string }

/** Validate + build the script for the judge to review. No reservation, no call. */
export async function draftDemoCall(invoiceId: string, phone: string, region?: string): Promise<DraftResult> {
  const v = validateDestination(phone, region)
  if (!v.ok) return { ok: false, message: phoneRejectionMessage(v.reason) }
  const invoice = await loadInvoice(invoiceId)
  if (!invoice) return { ok: false, message: 'Invoice not found.' }
  const script = generateCallScript(
    { clientName: invoice.client_name, amount: invoice.amount, currency: invoice.currency, dueDays: dueDays(invoice.due_date) },
    v.region,
  )
  return { ok: true, script, masked: v.masked, region: v.region, budget: await getBudget() }
}

export type PlaceResult =
  | { ok: true; calleCallId: string; masked: string; region: string; remaining: number | null }
  | { ok: false; message: string }

/** Validate → guard → draft+approve → place. Non-blocking; the UI then polls. */
export async function placeDemoCall(invoiceId: string, phone: string, region?: string): Promise<PlaceResult> {
  const supabase = createSupabaseServer()
  const result = await runDemoCall(
    {
      budget: demoCallBudget(),
      ipHash: await clientIpHash(),
      store: supabaseBudgetStore(supabase),
      calle: getCalleClient(),
      getInvoice: loadInvoice,
      sink: {
        async createApprovedArrangement(invoice, proposedTerms) {
          const { data, error } = await supabase
            .from('arrangements')
            .insert({
              invoice_id: invoice.id,
              user_id: invoice.user_id,
              proposed_terms: proposedTerms,
              status: 'approved',
              human_approved: true,
              client_agreed: false,
              approved_at: new Date().toISOString(),
            })
            .select('id')
            .single()
          if (error || !data) throw new Error(`arrangement insert failed: ${error?.message ?? 'no data'}`)
          return { id: data.id }
        },
        async insertCallRow(invoice, calleCallId) {
          const { data, error } = await supabase
            .from('calls')
            .insert({
              invoice_id: invoice.id,
              user_id: invoice.user_id,
              started_at: new Date().toISOString(),
              calle_call_id: calleCallId,
            })
            .select('id')
            .single()
          if (error || !data) throw new Error(`call row insert failed: ${error?.message ?? 'no data'}`)
          return { id: data.id }
        },
      },
    },
    { invoiceId, phone, region },
  )

  if (!result.ok) return { ok: false, message: result.message }
  return {
    ok: true,
    calleCallId: result.calleCallId,
    masked: result.masked,
    region: result.region,
    remaining: result.remaining,
  }
}

export interface TranscriptTurnView {
  role: 'agent' | 'human'
  text: string
  atSeconds: number
}

export type PollResult =
  | { done: false; status: string }
  | {
      done: true
      status: string
      outcome: string
      paymentDate: string | null
      durationSeconds: number | null
      transcript: TranscriptTurnView[]
    }

/** Poll a placed call for its terminal result, recording it once when it lands. */
export async function pollDemoCall(calleCallId: string): Promise<PollResult> {
  const supabase = createSupabaseServer()
  const calle = getCalleClient()
  const status = await calle.getCallStatus(calleCallId)
  const terminal =
    status.status === 'completed' || status.status === 'failed' || status.status === 'canceled'
  if (!terminal) return { done: false, status: status.status }

  const transcript = await calle.getTranscript(calleCallId)
  const dbOutcome = mapCalleOutcome(status.outcome)
  let transcriptRef = transcript.summary ?? `calle:${calleCallId}`
  if (dbOutcome === 'committed' && status.paymentDate) {
    transcriptRef = `${transcriptRef} · Payment date: ${status.paymentDate}`
  }

  // Record the outcome on the call row and finalize the reservation (idempotent
  // by calle_call_id; service-role bypasses RLS). Seeded invoice status is left
  // unchanged so the demo dataset stays stable across judges.
  await supabase
    .from('calls')
    .update({ outcome: dbOutcome, duration_seconds: status.durationSeconds, transcript_ref: transcriptRef })
    .eq('calle_call_id', calleCallId)
  await supabase
    .from('demo_calls')
    .update({ status: 'completed', outcome: dbOutcome })
    .eq('calle_call_id', calleCallId)

  return {
    done: true,
    status: status.status,
    outcome: dbOutcome,
    paymentDate: status.paymentDate,
    durationSeconds: status.durationSeconds,
    transcript: transcript.entries.map((e) => ({ role: e.role, text: e.text, atSeconds: e.timestampSeconds })),
  }
}
