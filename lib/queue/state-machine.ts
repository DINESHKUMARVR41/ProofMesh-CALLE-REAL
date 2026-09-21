/**
 * Call-queue state machine (Phase F: scheduled drafting + batch approval).
 *
 * Lifecycle: drafted -> approved -> dialing -> completed
 *            drafted -> dropped | expired      (owner drops / draft ages out)
 *            approved -> dropped               (cancellable before dialing)
 *            dialing  -> approved              (failed call releases its lease to retry)
 *
 * Pure (no I/O, no env) so both server actions and tests import it. The server
 * actions call assertCanTransition()/assertCanApprove() before every DB write; the
 * DB trigger (enforce_call_queue_transitions) is the data-layer backstop for the
 * two critical guarantees — no dialing without approval, no approving an expired draft.
 */

export type CallQueueStatus =
  | 'drafted'
  | 'approved'
  | 'dialing'
  | 'completed'
  | 'dropped'
  | 'expired'

export interface CallQueueForValidation {
  id: string
  status: CallQueueStatus
  /** ISO timestamp; a drafted row past this can no longer be approved. */
  expires_at: string
}

const CALL_QUEUE_STATUSES: readonly CallQueueStatus[] = [
  'drafted',
  'approved',
  'dialing',
  'completed',
  'dropped',
  'expired',
]

export function isCallQueueStatus(s: string): s is CallQueueStatus {
  return (CALL_QUEUE_STATUSES as readonly string[]).includes(s)
}

// Valid next states for each current state.
const VALID_TRANSITIONS: Readonly<Record<CallQueueStatus, ReadonlySet<CallQueueStatus>>> = {
  drafted: new Set(['approved', 'dropped', 'expired']),
  approved: new Set(['dialing', 'dropped']),
  dialing: new Set(['completed', 'approved']), // approved = release lease to retry
  completed: new Set([]),
  dropped: new Set([]),
  expired: new Set([]),
}

export function canTransition(from: CallQueueStatus, to: CallQueueStatus): boolean {
  return VALID_TRANSITIONS[from].has(to)
}

export function assertCanTransition(from: CallQueueStatus, to: CallQueueStatus): void {
  if (!canTransition(from, to)) {
    const allowed = [...VALID_TRANSITIONS[from]].join(', ') || 'none'
    throw new Error(
      `Invalid call_queue transition: ${from} -> ${to}. Allowed from '${from}': [${allowed}]`,
    )
  }
}

/** True when a drafted row is still within its approval window. */
export function isExpired(entry: CallQueueForValidation, now: Date = new Date()): boolean {
  return new Date(entry.expires_at).getTime() <= now.getTime()
}

/**
 * Guard called before approving a drafted entry. Throws if it is not 'drafted' or
 * if its window has elapsed — an aged-out draft must never dial. Mirrors the DB
 * trigger's second guarantee.
 */
export function assertCanApprove(entry: CallQueueForValidation, now: Date = new Date()): void {
  if (entry.status !== 'drafted') {
    throw new Error(
      `Cannot approve call_queue ${entry.id}: status is '${entry.status}', must be 'drafted'`,
    )
  }
  if (isExpired(entry, now)) {
    throw new Error(`Cannot approve call_queue ${entry.id}: the draft expired at ${entry.expires_at}`)
  }
}
