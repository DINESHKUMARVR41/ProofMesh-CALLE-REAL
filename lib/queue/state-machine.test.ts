/**
 * Call-queue state machine test. Run with: tsx lib/queue/state-machine.test.ts
 *
 * Proves the app-layer guarantees that back the DB trigger:
 *   - drafted cannot jump straight to dialing (must pass through approved),
 *   - an expired draft cannot be approved,
 *   - the full transition table (drop, retry-lease release, terminal states).
 * The live DB trigger (enforce_call_queue_transitions) is verified separately
 * against staging.
 */
import assert from 'node:assert/strict'

import {
  assertCanApprove,
  assertCanTransition,
  canTransition,
  isCallQueueStatus,
  isExpired,
} from './state-machine'
import type { CallQueueForValidation, CallQueueStatus } from './state-machine'

const HOUR = 3_600_000

function run(): void {
  // ── Status guard ────────────────────────────────────────────────────────────
  assert.ok(isCallQueueStatus('drafted') && isCallQueueStatus('dialing'), 'known statuses recognized')
  assert.ok(!isCallQueueStatus('nope'), 'unknown status rejected')

  // ── The core guarantee: no drafted -> dialing without approval ──────────────
  assert.ok(!canTransition('drafted', 'dialing'), 'drafted cannot jump to dialing')
  assert.throws(() => assertCanTransition('drafted', 'dialing'), /Invalid call_queue transition/, 'drafted->dialing throws')
  assert.ok(canTransition('drafted', 'approved'), 'drafted -> approved allowed')
  assert.ok(canTransition('approved', 'dialing'), 'approved -> dialing allowed')

  // ── Drop + expiry paths ─────────────────────────────────────────────────────
  assert.ok(canTransition('drafted', 'dropped'), 'drafted -> dropped allowed')
  assert.ok(canTransition('drafted', 'expired'), 'drafted -> expired allowed')
  assert.ok(canTransition('approved', 'dropped'), 'approved -> dropped (cancel before dialing)')

  // ── Retry lease release + terminal states ───────────────────────────────────
  assert.ok(canTransition('dialing', 'completed'), 'dialing -> completed allowed')
  assert.ok(canTransition('dialing', 'approved'), 'dialing -> approved (lease release for retry)')
  for (const terminal of ['completed', 'dropped', 'expired'] as CallQueueStatus[]) {
    assert.equal(
      [...(['drafted', 'approved', 'dialing', 'completed', 'dropped', 'expired'] as CallQueueStatus[])].filter(
        (to) => canTransition(terminal, to),
      ).length,
      0,
      `${terminal} is terminal`,
    )
  }

  // ── Approval respects the expiry window ─────────────────────────────────────
  const now = new Date()
  const fresh: CallQueueForValidation = {
    id: 'q1',
    status: 'drafted',
    expires_at: new Date(now.getTime() + 24 * HOUR).toISOString(),
  }
  const stale: CallQueueForValidation = {
    id: 'q2',
    status: 'drafted',
    expires_at: new Date(now.getTime() - HOUR).toISOString(),
  }
  assert.ok(!isExpired(fresh, now) && isExpired(stale, now), 'expiry window computed correctly')
  assert.doesNotThrow(() => assertCanApprove(fresh, now), 'a fresh draft can be approved')
  assert.throws(() => assertCanApprove(stale, now), /expired/, 'an expired draft cannot be approved')
  assert.throws(
    () => assertCanApprove({ id: 'q3', status: 'dialing', expires_at: fresh.expires_at }, now),
    /must be 'drafted'/,
    'only a drafted row can be approved',
  )

  console.log('\n✓ call_queue state machine: no dialing without approval; expired drafts cannot be approved; terminals are terminal\n')
}

try {
  run()
} catch (err) {
  console.error('FAIL', err)
  process.exitCode = 1
}
