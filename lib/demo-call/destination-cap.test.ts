/**
 * Per-destination cap test (ABUSE-REVIEW B1). Run with:
 *   tsx lib/demo-call/destination-cap.test.ts
 *
 * B1 is the IP-rotation harassment path: the per-IP cap (2/24h) does not stop an
 * attacker who rotates IPs from aiming the whole budget at ONE number. The fix is
 * a per-destination cap of 2 per 24h inside reserve_demo_call. This proves, through
 * the real product path (runDemoCall), that:
 *   - the 1st and 2nd calls to a masked destination place (a judge's one retry survives),
 *   - the 3rd call to the SAME masked destination — even from a fresh IP — is REFUSED
 *     with `destination_limit`, and CALL-E's placeCall is NEVER invoked on that refusal,
 *   - the cap is per-destination, not global: a different number still places.
 *
 * The store here mirrors reserve_demo_call's cap order (budget -> per-IP ->
 * per-destination). The AUTHORITATIVE cap is the SQL function; its live behaviour
 * is verified separately against the demo project. The 2-min global rate cap is
 * enforced identically in SQL and covered by budget.test.ts — omitted here so the
 * per-destination boundary can be exercised without wall-clock spacing.
 */
import assert from 'node:assert/strict'

import { runDemoCall } from './run'
import type { DemoCallDeps, DemoInvoice } from './run'
import type { BudgetStore } from './budget'
import type {
  CalleClient,
  GetCallStatusResult,
  GetTranscriptResult,
  PlaceCallParams,
  PlaceCallResult,
} from '../calle/types'

const INVOICE: DemoInvoice = {
  id: 'inv-1',
  user_id: 'user-1',
  client_name: 'Test Client',
  amount: 4500,
  currency: 'USD',
  due_date: new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10),
  language_preference: 'en',
}

/** In-memory mirror of reserve_demo_call's caps (see file header). */
function makeCapStore(): BudgetStore & { rows: Array<{ ipHash: string; dest: string }> } {
  const rows: Array<{ ipHash: string; dest: string }> = []
  return {
    rows,
    async reserve(ipHash, destinationMasked, _region, budget) {
      if (rows.length >= budget) return { allowed: false, reason: 'budget_exhausted', remaining: 0 }
      if (rows.filter((r) => r.ipHash === ipHash).length >= 2) return { allowed: false, reason: 'ip_limit' }
      if (rows.filter((r) => r.dest === destinationMasked).length >= 2) {
        return { allowed: false, reason: 'destination_limit' }
      }
      rows.push({ ipHash, dest: destinationMasked })
      return { allowed: true, callId: `res-${rows.length}`, remaining: budget - rows.length }
    },
    async finalize() {},
    async snapshot(budget) {
      return { total: budget, used: rows.length, remaining: budget - rows.length }
    },
  }
}

/** Deps sharing one store + one placeCall spy, with a per-call IP (rotation). */
function makeDeps(
  store: BudgetStore,
  ipHash: string,
  place: { count: number },
): DemoCallDeps {
  const calle: CalleClient = {
    async placeCall(_p: PlaceCallParams): Promise<PlaceCallResult> {
      place.count++
      return { callId: `call_${place.count}`, status: 'queued', createdAt: new Date().toISOString() }
    },
    async getCallStatus(): Promise<GetCallStatusResult> {
      throw new Error('not used')
    },
    async getTranscript(): Promise<GetTranscriptResult> {
      throw new Error('not used')
    },
  }
  return {
    budget: 60,
    ipHash,
    store,
    calle,
    async getInvoice(id) {
      return id === INVOICE.id ? INVOICE : null
    },
    sink: {
      async createApprovedArrangement() {
        return { id: 'arr-1' }
      },
      async insertCallRow() {
        return { id: 'callrow-1' }
      },
    },
  }
}

async function run(): Promise<void> {
  const store = makeCapStore()
  const place = { count: 0 }
  const VICTIM = '+8801711000000' // same destination, three rotated source IPs

  // ── 1st & 2nd calls to the destination place (judge's one retry survives) ────
  const c1 = await runDemoCall(makeDeps(store, 'ip-1', place), { invoiceId: 'inv-1', phone: VICTIM })
  assert.ok(c1.ok, '1st call to destination is allowed')
  const c2 = await runDemoCall(makeDeps(store, 'ip-2', place), { invoiceId: 'inv-1', phone: VICTIM })
  assert.ok(c2.ok, '2nd call to same destination is allowed (one retry)')
  assert.equal(place.count, 2, 'CALL-E placed exactly twice for the two allowed calls')
  assert.ok(c1.ok && c1.masked.includes('*'), 'destination is capped by its MASKED form')

  // ── 3rd call to the SAME destination (fresh IP) is refused; CALL-E untouched ─
  const c3 = await runDemoCall(makeDeps(store, 'ip-3', place), { invoiceId: 'inv-1', phone: VICTIM })
  assert.ok(!c3.ok, '3rd call to same destination is refused')
  assert.ok(!c3.ok && c3.kind === 'budget', 'refusal surfaces as a budget/cap denial')
  assert.ok(!c3.ok && c3.reason === 'destination_limit', 'refusal reason is destination_limit')
  assert.equal(place.count, 2, 'CALL-E is NEVER invoked on the refused 3rd call')

  // ── The cap is per-destination, not global: a different number still places.
  //    NB the cap keys on the MASKED destination (country code + last 3 digits),
  //    so this number must differ in its mask — a distinct last-3 (…123 vs …000).
  //    Numbers that collide under the mask share a bucket, which only makes the
  //    cap stricter (fails safe), never weaker.
  const other = await runDemoCall(makeDeps(store, 'ip-4', place), {
    invoiceId: 'inv-1',
    phone: '+8801822000123',
  })
  assert.ok(other.ok, 'a different destination still places despite the capped one')
  assert.equal(place.count, 3, 'the different destination placed exactly one more call')

  console.log(
    '\n✓ per-destination cap: 3rd call to one masked number refused (destination_limit), CALL-E never touched; other numbers unaffected\n',
  )
}

run().catch((err: unknown) => {
  console.error('FAIL', err)
  process.exitCode = 1
})
