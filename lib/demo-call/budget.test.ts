/**
 * Budget guard test. Run with: tsx lib/demo-call/budget.test.ts
 *
 * Proves the guard refuses a call for each cap (total budget, per-IP, rate
 * limit) and that CALL-E (the `place` callback) is NEVER invoked on a denial —
 * and that an allowed reservation does invoke it exactly once.
 */
import assert from 'node:assert/strict'

import { runGuardedDemoCall, demoCallBudget, denyMessage } from './budget'
import type { BudgetStore, DenyReason, ReserveResult } from './budget'

function storeReturning(result: ReserveResult): BudgetStore {
  return {
    async reserve() {
      return result
    },
    async finalize() {},
    async snapshot(budget) {
      return { total: budget, used: 0, remaining: budget }
    },
  }
}

const PARAMS = { ipHash: 'iphash', destinationMasked: '+880*****000', region: 'BD', budget: 60 }

async function run(): Promise<void> {
  // ── Each cap denies, and place() (CALL-E) is never called ───────────────────
  for (const reason of ['budget_exhausted', 'ip_limit', 'rate_limited'] as DenyReason[]) {
    let placeCalls = 0
    const store = storeReturning({ allowed: false, reason })
    const { reservation, placed } = await runGuardedDemoCall(store, PARAMS, async () => {
      placeCalls++
      return 'PLACED'
    })
    assert.equal(reservation.allowed, false, `${reason}: reservation must be denied`)
    assert.equal(reservation.reason, reason, `${reason}: reason preserved`)
    assert.equal(placeCalls, 0, `${reason}: CALL-E (place) must NOT be called`)
    assert.equal(placed, null, `${reason}: nothing placed`)
    assert.ok(denyMessage(reason).length > 0, `${reason}: has a plain message`)
  }

  // ── An allowed reservation invokes place() exactly once ─────────────────────
  let placeCalls = 0
  const okStore = storeReturning({ allowed: true, callId: 'res_1', remaining: 59 })
  const { reservation, placed } = await runGuardedDemoCall(okStore, PARAMS, async (id) => {
    placeCalls++
    assert.equal(id, 'res_1', 'place receives the reservation id')
    return 'PLACED'
  })
  assert.equal(reservation.allowed, true, 'allowed reservation')
  assert.equal(placeCalls, 1, 'place called exactly once when allowed')
  assert.equal(placed, 'PLACED', 'placed value returned')

  // ── Budget env parsing ──────────────────────────────────────────────────────
  const prev = process.env.DEMO_CALL_BUDGET
  delete process.env.DEMO_CALL_BUDGET
  assert.equal(demoCallBudget(), 60, 'default budget is 60')
  process.env.DEMO_CALL_BUDGET = '25'
  assert.equal(demoCallBudget(), 25, 'budget read from env')
  process.env.DEMO_CALL_BUDGET = 'nonsense'
  assert.equal(demoCallBudget(), 60, 'invalid budget falls back to 60')
  if (prev === undefined) delete process.env.DEMO_CALL_BUDGET
  else process.env.DEMO_CALL_BUDGET = prev

  console.log('\n✓ budget guard: every cap denies without touching CALL-E; allowed path places once\n')
}

run().catch((err: unknown) => {
  console.error('FAIL', err)
  process.exitCode = 1
})
