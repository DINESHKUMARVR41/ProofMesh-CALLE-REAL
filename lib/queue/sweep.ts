// Phase F: the threshold sweep. Finds invoices that have crossed an overdue
// threshold and drafts a recovery call for each — nothing more. Drafts are then
// reviewed and approved by a human on the /queue page; only approved drafts dial.
//
// Pure planning (planSweep) is separated from I/O (runSweep) so the decision logic
// is testable without a DB. Idempotency + no-double-draft come from BOTH the
// open-entry check here AND the partial unique index on call_queue — the index is
// the real guarantee under concurrency; this check just avoids the wasted insert.
import { generateCallScript } from '../calls/generate-script'
import { validateDestination } from '../demo-call/phone'

export interface SweepInvoice {
  id: string
  user_id: string
  client_name: string
  amount: number
  currency: string
  due_date: string
  status: string
  language_preference: string | null
  client_phone: string | null
  client_region: string | null
}

export interface SweepConfig {
  /** Overdue thresholds (days) that warrant drafting; the minimum is the trigger. */
  thresholdsDays: number[]
  /** Suppress drafting if a call was placed within this many days (creates cadence). */
  recentCallDays: number
  /** How long a draft stays approvable before it ages out. */
  draftTtlHours: number
}

export const DEFAULT_SWEEP_CONFIG: SweepConfig = {
  thresholdsDays: [7, 14, 30],
  recentCallDays: 7,
  draftTtlHours: 48,
}

/** Never draft for an invoice already settled, frozen in dispute, or arranged. */
const EXCLUDED_STATUSES = new Set(['paid', 'disputed', 'arranged'])

export function daysOverdue(dueDate: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86_400_000)
}

export type SkipReason =
  | 'excluded_status' // paid / disputed / arranged
  | 'not_overdue' // hasn't crossed the minimum threshold
  | 'no_phone' // no client_phone on file — surfaced on /queue, not silently dropped
  | 'unsupported_number' // has a phone but it fails destination validation
  | 'open_entry' // already has a drafted/approved/dialing queue entry
  | 'recent_call' // called within recentCallDays

export interface DraftPlan {
  invoice: SweepInvoice
  toPhone: string
  toRegion: string
  script: string
  scheduledFor: Date
  expiresAt: Date
}

export interface SweepFacts {
  /** Invoices with an OPEN (drafted/approved/dialing) queue entry. */
  openQueueInvoiceIds: Set<string>
  /** Invoices with a call placed within recentCallDays. */
  recentCallInvoiceIds: Set<string>
}

export interface SweepDecision {
  drafts: DraftPlan[]
  skipped: Array<{ invoiceId: string; reason: SkipReason }>
}

/**
 * Decide, for a batch of invoices, which get a fresh draft and which are skipped
 * (and why). Pure — no I/O. The phone checks come before the open-entry/recent-call
 * checks so an overdue invoice with no valid number is always reported as
 * `no_phone`/`unsupported_number` (which the /queue page surfaces), regardless of
 * its call history.
 */
export function planSweep(
  invoices: SweepInvoice[],
  facts: SweepFacts,
  config: SweepConfig,
  now: Date,
): SweepDecision {
  const minThreshold = Math.min(...config.thresholdsDays)
  const drafts: DraftPlan[] = []
  const skipped: SweepDecision['skipped'] = []
  const skip = (invoiceId: string, reason: SkipReason) => skipped.push({ invoiceId, reason })

  for (const inv of invoices) {
    if (EXCLUDED_STATUSES.has(inv.status)) {
      skip(inv.id, 'excluded_status')
      continue
    }
    const overdue = daysOverdue(inv.due_date, now)
    if (overdue < minThreshold) {
      skip(inv.id, 'not_overdue')
      continue
    }
    if (!inv.client_phone) {
      skip(inv.id, 'no_phone')
      continue
    }
    const v = validateDestination(inv.client_phone, inv.client_region ?? undefined)
    if (!v.ok) {
      skip(inv.id, 'unsupported_number')
      continue
    }
    if (facts.openQueueInvoiceIds.has(inv.id)) {
      skip(inv.id, 'open_entry')
      continue
    }
    if (facts.recentCallInvoiceIds.has(inv.id)) {
      skip(inv.id, 'recent_call')
      continue
    }
    const script = generateCallScript(
      { clientName: inv.client_name, amount: inv.amount, currency: inv.currency, dueDays: overdue },
      v.region,
    )
    drafts.push({
      invoice: inv,
      toPhone: v.e164,
      toRegion: v.region,
      script,
      // Due now; the dialer enforces the calling-hours window before actually placing.
      scheduledFor: now,
      expiresAt: new Date(now.getTime() + config.draftTtlHours * 3_600_000),
    })
  }
  return { drafts, skipped }
}

/** Read sweep config from env, falling back to DEFAULT_SWEEP_CONFIG. */
export function sweepConfigFromEnv(): SweepConfig {
  const thresholds = (process.env.QUEUE_OVERDUE_THRESHOLDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
  const recent = Number(process.env.QUEUE_RECENT_CALL_DAYS)
  const ttl = Number(process.env.QUEUE_DRAFT_TTL_HOURS)
  return {
    thresholdsDays: thresholds.length > 0 ? thresholds : DEFAULT_SWEEP_CONFIG.thresholdsDays,
    recentCallDays: Number.isFinite(recent) && recent > 0 ? recent : DEFAULT_SWEEP_CONFIG.recentCallDays,
    draftTtlHours: Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_SWEEP_CONFIG.draftTtlHours,
  }
}

/** DB surface the sweep needs, injected so the route handler and tests share a path. */
export interface SweepDeps {
  now: Date
  config: SweepConfig
  /** Mark drafted rows past their window as 'expired'; returns how many. */
  expireStaleDrafts(now: Date): Promise<number>
  listInvoices(): Promise<SweepInvoice[]>
  loadFacts(invoiceIds: string[], recentCallDays: number, now: Date): Promise<SweepFacts>
  /** Insert one draft; returns 'duplicate' when the partial unique index rejects it. */
  insertDraft(plan: DraftPlan): Promise<'inserted' | 'duplicate'>
}

export interface SweepResult {
  expired: number
  drafted: number
  duplicates: number
  skipped: SweepDecision['skipped']
}

/**
 * Run one sweep: expire stale drafts, then read invoices + facts, plan, and insert
 * each draft. Expiring first matters — a never-approved draft otherwise holds the
 * one-open-per-invoice slot forever and blocks re-drafting at a later threshold.
 * Idempotent — a second run finds the first run's entries as open and drafts
 * nothing; and if two runs race, the partial unique index turns the loser's insert
 * into a 'duplicate'.
 */
export async function runSweep(deps: SweepDeps): Promise<SweepResult> {
  const expired = await deps.expireStaleDrafts(deps.now)
  const invoices = await deps.listInvoices()
  const facts = await deps.loadFacts(
    invoices.map((i) => i.id),
    deps.config.recentCallDays,
    deps.now,
  )
  const decision = planSweep(invoices, facts, deps.config, deps.now)

  let drafted = 0
  let duplicates = 0
  for (const plan of decision.drafts) {
    const outcome = await deps.insertDraft(plan)
    if (outcome === 'inserted') drafted++
    else duplicates++
  }
  return { expired, drafted, duplicates, skipped: decision.skipped }
}
