/**
 * Arrangement draft-then-approve state machine.
 *
 * Lifecycle: drafted -> approved -> executed
 *            drafted -> rejected
 *            approved -> rejected  (withdraw approval before execution)
 *
 * This module is pure (no I/O, no env vars) so it can be imported by both
 * server actions and test files. The server action calls assertCanExecute()
 * and assertCanTransition() before every DB write.
 */

export type ArrangementStatus = 'drafted' | 'approved' | 'rejected' | 'executed'

export interface ArrangementForValidation {
  id: string
  status: ArrangementStatus
  human_approved: boolean
}

// Narrowing guard: use when reading status from the DB (which types it as string).
const ARRANGEMENT_STATUSES: readonly ArrangementStatus[] = [
  'drafted',
  'approved',
  'rejected',
  'executed',
]

export function isArrangementStatus(s: string): s is ArrangementStatus {
  return (ARRANGEMENT_STATUSES as readonly string[]).includes(s)
}

// Valid next states for each current state.
const VALID_TRANSITIONS: Readonly<Record<ArrangementStatus, ReadonlySet<ArrangementStatus>>> = {
  drafted:  new Set(['approved', 'rejected']),
  approved: new Set(['executed', 'rejected']),
  rejected: new Set([]),
  executed: new Set([]),
}

export function canTransition(from: ArrangementStatus, to: ArrangementStatus): boolean {
  return VALID_TRANSITIONS[from].has(to)
}

export function assertCanTransition(from: ArrangementStatus, to: ArrangementStatus): void {
  if (!canTransition(from, to)) {
    const allowed = [...VALID_TRANSITIONS[from]].join(', ') || 'none'
    throw new Error(
      `Invalid arrangement transition: ${from} -> ${to}. Allowed from '${from}': [${allowed}]`,
    )
  }
}

/**
 * Primary guard called by executeArrangement() before any DB write.
 * Throws if the arrangement has not been human-approved.
 * The DB trigger (prevent_unapproved_execution) is the second line of defense.
 */
export function assertCanExecute(arrangement: ArrangementForValidation): void {
  if (arrangement.status !== 'approved') {
    throw new Error(
      `Cannot execute arrangement ${arrangement.id}: status is '${arrangement.status}', must be 'approved'`,
    )
  }
  if (!arrangement.human_approved) {
    throw new Error(
      `Cannot execute arrangement ${arrangement.id}: human_approved is false`,
    )
  }
}
