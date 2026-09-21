// The dialer: places ONE approved call per invocation, at intervals, safely.
//
// All the concurrency safety lives in the DB claim (claim_next_call): one call at
// a time, per-destination cap, calling-hours filter, stale-lease recovery. This
// module is the placement half — it re-validates the destination against the same
// module the judge flow uses (so an invoice edited to an unsupported region after
// drafting will not dial), places the call, records the outcome, and links a calls
// row. On failure it retries once, then records the entry as an error.
import type { CalleClient } from '../calle/types'
import { validateDestination } from '../demo-call/phone'
import { mapCalleOutcome, type DbCallOutcome } from '../calls/outcome-map'
import {
  DEFAULT_CALLING_HOURS,
  callingHoursFromEnv,
  regionsInCallingHours,
  type CallingHours,
} from './calling-hours'

export interface DialerConfig {
  destCap: number // per-destination cap in 24h (B1 backstop). Default 2.
  staleMinutes: number // reclaim a 'dialing' lease older than this (crashed dialer)
  callingHours: CallingHours
  maxAttempts: number // total attempts before an entry lands as error. Default 2.
}

export const DEFAULT_DIALER_CONFIG: DialerConfig = {
  destCap: 2,
  staleMinutes: 25, // > CALL-E's 20-min max call duration
  callingHours: DEFAULT_CALLING_HOURS,
  maxAttempts: 2,
}

export function dialerConfigFromEnv(): DialerConfig {
  const destCap = Number(process.env.QUEUE_DEST_CAP)
  const stale = Number(process.env.QUEUE_DIAL_STALE_MINUTES)
  return {
    destCap: Number.isInteger(destCap) && destCap > 0 ? destCap : DEFAULT_DIALER_CONFIG.destCap,
    staleMinutes: Number.isInteger(stale) && stale > 0 ? stale : DEFAULT_DIALER_CONFIG.staleMinutes,
    callingHours: callingHoursFromEnv(),
    maxAttempts: DEFAULT_DIALER_CONFIG.maxAttempts,
  }
}

export interface ClaimedCall {
  id: string
  invoice_id: string
  user_id: string
  to_phone: string | null
  to_region: string | null
  script: string
  attempts: number
}

export interface DialerInvoice {
  id: string
  user_id: string
  client_name: string
  amount: number
  currency: string
  due_date: string
  language_preference: string | null
  client_phone: string | null
  client_region: string | null
}

export interface CompletedRecord {
  entryId: string
  invoiceId: string
  userId: string
  calleCallId: string | null
  outcome: DbCallOutcome
  durationSeconds: number | null
  transcriptRef: string
}

export interface DialerDeps {
  now: Date
  config: DialerConfig
  /** All CALL-E regions — the pool the calling-hours filter selects from. */
  allRegions: string[]
  calle: CalleClient
  claimNext(
    allowedRegions: string[],
    now: Date,
    destCap: number,
    staleMinutes: number,
  ): Promise<ClaimedCall | null>
  loadInvoice(id: string): Promise<DialerInvoice | null>
  /** Insert a calls row, link it, mark the entry completed. */
  recordCompleted(rec: CompletedRecord): Promise<void>
  /** Release the lease (dialing -> approved) so a later tick retries. */
  releaseForRetry(entryId: string): Promise<void>
}

export type DialerResult =
  | { placed: false; reason: 'out_of_hours' }
  | { placed: false; reason: 'none_due' }
  | { placed: false; reason: 'invalid_destination'; entryId: string }
  | { placed: false; reason: 'failed_retry'; entryId: string }
  | { placed: false; reason: 'failed_error'; entryId: string }
  | { placed: true; entryId: string; calleCallId: string; outcome: DbCallOutcome }

const POLL_MAX_ATTEMPTS = 660 // 660 x 2s = 22 min; mock returns terminal immediately

function dueDaysOf(dueDate: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86_400_000))
}

/**
 * Run one dialer tick. Returns what happened — placed a call, or why not.
 */
export async function runDialer(deps: DialerDeps): Promise<DialerResult> {
  const allowed = regionsInCallingHours(deps.allRegions, deps.now, deps.config.callingHours)
  if (allowed.length === 0) return { placed: false, reason: 'out_of_hours' }

  const claimed = await deps.claimNext(allowed, deps.now, deps.config.destCap, deps.config.staleMinutes)
  if (!claimed) return { placed: false, reason: 'none_due' }

  const invoice = await deps.loadInvoice(claimed.invoice_id)

  // Re-validate the CURRENT destination with the same module the judge flow uses.
  // If the invoice was edited to an unsupported number after drafting, we do NOT
  // dial — record it as an error (a calls row documents it) and stop. No retry: a
  // bad number will not fix itself.
  const phone = invoice?.client_phone ?? claimed.to_phone ?? ''
  const region = invoice?.client_region ?? claimed.to_region ?? undefined
  const valid = validateDestination(phone, region)
  if (!valid.ok) {
    await deps.recordCompleted({
      entryId: claimed.id,
      invoiceId: claimed.invoice_id,
      userId: claimed.user_id,
      calleCallId: null,
      outcome: 'error',
      durationSeconds: null,
      transcriptRef: `Not placed — destination invalid at dial time (${valid.reason}).`,
    })
    return { placed: false, reason: 'invalid_destination', entryId: claimed.id }
  }

  try {
    const place = await deps.calle.placeCall({
      toPhone: valid.e164,
      toRegion: valid.region,
      language: invoice?.language_preference ?? 'en',
      agentScript: claimed.script,
      metadata: {
        invoiceId: claimed.invoice_id,
        invoiceAmount: invoice?.amount ?? 0,
        currency: invoice?.currency ?? 'USD',
        clientName: invoice?.client_name ?? 'Client',
        dueDays: invoice ? dueDaysOf(invoice.due_date, deps.now) : 0,
      },
    })

    let status = place.status
    let statusResult = await deps.calle.getCallStatus(place.callId)
    status = statusResult.status
    let polls = 0
    while ((status === 'queued' || status === 'in_progress') && polls < POLL_MAX_ATTEMPTS) {
      statusResult = await deps.calle.getCallStatus(place.callId)
      status = statusResult.status
      polls++
    }

    const transcript = await deps.calle.getTranscript(place.callId)
    const outcome = mapCalleOutcome(statusResult.outcome)
    let transcriptRef = transcript.summary ?? `calle:${place.callId}`
    if (outcome === 'committed' && statusResult.paymentDate) {
      transcriptRef = `${transcriptRef} · Payment date: ${statusResult.paymentDate}`
    }

    await deps.recordCompleted({
      entryId: claimed.id,
      invoiceId: claimed.invoice_id,
      userId: claimed.user_id,
      calleCallId: place.callId,
      outcome,
      durationSeconds: statusResult.durationSeconds,
      transcriptRef,
    })
    return { placed: true, entryId: claimed.id, calleCallId: place.callId, outcome }
  } catch (err) {
    // attempts was incremented when the entry was claimed, so on the first failure
    // it is 1 (< maxAttempts) → release for one retry; on the second it is 2 → error.
    if (claimed.attempts < deps.config.maxAttempts) {
      await deps.releaseForRetry(claimed.id)
      return { placed: false, reason: 'failed_retry', entryId: claimed.id }
    }
    const message = err instanceof Error ? err.message : 'dial failed'
    await deps.recordCompleted({
      entryId: claimed.id,
      invoiceId: claimed.invoice_id,
      userId: claimed.user_id,
      calleCallId: null,
      outcome: 'error',
      durationSeconds: null,
      transcriptRef: `Dial failed after ${claimed.attempts} attempts: ${message}`,
    })
    return { placed: false, reason: 'failed_error', entryId: claimed.id }
  }
}

/** All supported regions, filtered to those in calling hours — used by the route/script. */
export { regionsInCallingHours }
