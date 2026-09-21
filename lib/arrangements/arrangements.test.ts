/**
 * Tests for the arrangement draft-then-approve state machine.
 * Run with: tsx lib/arrangements/arrangements.test.ts
 *
 * Proves that:
 * 1. Attempting to execute an unapproved draft fails at the server action level.
 *    assertCanExecute() is the exact guard called by executeArrangement() before
 *    any DB write — if it throws, the server action throws and no execution occurs.
 * 2. Approval transitions state correctly through the full lifecycle.
 */

import assert from 'node:assert/strict'

import {
  assertCanExecute,
  assertCanTransition,
  canTransition,
  isArrangementStatus,
  type ArrangementForValidation,
  type ArrangementStatus,
} from './state-machine'

function makeArrangement(
  status: ArrangementStatus,
  human_approved: boolean,
): ArrangementForValidation {
  return { id: `test-${status}-${human_approved}`, status, human_approved }
}

function assertThrows(fn: () => unknown, label: string): void {
  try {
    fn()
    assert.fail(`Expected '${label}' to throw but it did not`)
  } catch (err: unknown) {
    if (err instanceof assert.AssertionError) throw err
    // any other thrown value means the guard fired as expected
  }
}

// ────────────────────────────────────────────────
// isArrangementStatus
// ────────────────────────────────────────────────
assert.equal(isArrangementStatus('drafted'), true)
assert.equal(isArrangementStatus('approved'), true)
assert.equal(isArrangementStatus('rejected'), true)
assert.equal(isArrangementStatus('executed'), true)
assert.equal(isArrangementStatus('pending'), false)
assert.equal(isArrangementStatus(''), false)
console.log('✓ isArrangementStatus: recognizes valid/invalid values')

// ────────────────────────────────────────────────
// canTransition
// ────────────────────────────────────────────────
assert.equal(canTransition('drafted', 'approved'), true,  'drafted -> approved')
assert.equal(canTransition('drafted', 'rejected'), true,  'drafted -> rejected')
assert.equal(canTransition('drafted', 'executed'), false, 'drafted -> executed (forbidden)')
assert.equal(canTransition('drafted', 'drafted'),  false, 'drafted -> drafted (no self-loop)')

assert.equal(canTransition('approved', 'executed'), true,  'approved -> executed')
assert.equal(canTransition('approved', 'rejected'), true,  'approved -> rejected (withdraw)')
assert.equal(canTransition('approved', 'drafted'),  false, 'approved -> drafted (forbidden)')

assert.equal(canTransition('rejected', 'approved'), false, 'rejected -> approved (no resurrection)')
assert.equal(canTransition('rejected', 'executed'), false, 'rejected -> executed (forbidden)')
assert.equal(canTransition('rejected', 'drafted'),  false, 'rejected -> drafted (forbidden)')

assert.equal(canTransition('executed', 'drafted'),  false, 'executed -> drafted (no revert)')
assert.equal(canTransition('executed', 'approved'), false, 'executed -> approved (no revert)')
assert.equal(canTransition('executed', 'rejected'), false, 'executed -> rejected (no revert)')

console.log('✓ canTransition: all transition rules correct')

// ────────────────────────────────────────────────
// assertCanTransition — forbidden transitions throw
// ────────────────────────────────────────────────
assertThrows(() => assertCanTransition('drafted',  'executed'), 'drafted -> executed')
assertThrows(() => assertCanTransition('rejected', 'approved'), 'rejected -> approved')
assertThrows(() => assertCanTransition('executed', 'drafted'),  'executed -> drafted')
assertThrows(() => assertCanTransition('approved', 'drafted'),  'approved -> drafted')

// valid transitions must NOT throw
assert.doesNotThrow(() => assertCanTransition('drafted', 'approved'))
assert.doesNotThrow(() => assertCanTransition('drafted', 'rejected'))
assert.doesNotThrow(() => assertCanTransition('approved', 'executed'))

console.log('✓ assertCanTransition: forbidden transitions throw, valid ones pass')

// ────────────────────────────────────────────────
// assertCanExecute — the executeArrangement() server action guard
//
// This is the EXACT function that executeArrangement() calls before any DB write.
// Proving it throws here proves the server action cannot execute an unapproved draft.
// ────────────────────────────────────────────────

// drafted + not approved → must throw
assertThrows(
  () => assertCanExecute(makeArrangement('drafted', false)),
  'drafted (unapproved) cannot be executed',
)

// drafted + human_approved=true still blocked (status check comes first)
assertThrows(
  () => assertCanExecute(makeArrangement('drafted', true)),
  'drafted (even if human_approved=true) cannot be executed',
)

// rejected → must throw
assertThrows(
  () => assertCanExecute(makeArrangement('rejected', false)),
  'rejected arrangement cannot be executed',
)

// already executed → must throw (idempotency guard)
assertThrows(
  () => assertCanExecute(makeArrangement('executed', true)),
  'already-executed arrangement cannot be re-executed',
)

// approved + human_approved=false → must throw (defensive double-check)
assertThrows(
  () => assertCanExecute(makeArrangement('approved', false)),
  'status=approved but human_approved=false must throw',
)

// approved + human_approved=true → must NOT throw (the happy path)
assert.doesNotThrow(
  () => assertCanExecute(makeArrangement('approved', true)),
  'approved arrangement with human_approved=true can be executed',
)

console.log('✓ assertCanExecute: unapproved drafts blocked; approved+human_approved=true passes')

// ────────────────────────────────────────────────
// Full lifecycle: drafted -> approved -> executed
// Mirrors what the server actions do step-by-step.
// ────────────────────────────────────────────────
{
  let status: ArrangementStatus = 'drafted'

  // draftArrangement creates with status='drafted', human_approved=false
  assert.equal(canTransition(status, 'approved'), true)
  assertThrows(
    () => assertCanExecute({ id: 'lifecycle', status, human_approved: false }),
    'cannot execute while drafted',
  )

  // approveArrangement transitions to 'approved' and sets human_approved=true
  assertCanTransition(status, 'approved')
  status = 'approved'

  // now assertCanExecute passes
  assert.doesNotThrow(() =>
    assertCanExecute({ id: 'lifecycle', status, human_approved: true }),
  )

  // executeArrangement can now proceed
  assertCanTransition(status, 'executed')
  status = 'executed'

  // from executed: no further transitions
  assert.equal(canTransition(status, 'drafted'),  false)
  assert.equal(canTransition(status, 'approved'), false)
  assert.equal(canTransition(status, 'rejected'), false)

  console.log('✓ Full lifecycle: drafted -> approved -> executed, terminal state confirmed')
}

// ────────────────────────────────────────────────
// Rejection path
// ────────────────────────────────────────────────
{
  let status: ArrangementStatus = 'drafted'

  assertCanTransition(status, 'rejected')
  status = 'rejected'

  assert.equal(canTransition(status, 'drafted'),  false, 'no revert from rejected')
  assert.equal(canTransition(status, 'approved'), false, 'no resurrection')
  assert.equal(canTransition(status, 'executed'), false, 'cannot execute rejected')

  console.log('✓ Rejected path: terminal, no further transitions')
}

// ────────────────────────────────────────────────
// Approval withdrawal (approved -> rejected)
// ────────────────────────────────────────────────
{
  let status: ArrangementStatus = 'drafted'
  assertCanTransition(status, 'approved')
  status = 'approved'

  // approval can be withdrawn before execution
  assertCanTransition(status, 'rejected')
  status = 'rejected'

  // now terminal
  assert.equal(canTransition(status, 'executed'), false, 'cannot execute after withdrawal')

  console.log('✓ Approval withdrawal: approved -> rejected -> terminal')
}

console.log('\n✓ All arrangement state machine assertions passed\n')
