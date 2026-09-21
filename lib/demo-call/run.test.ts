/**
 * Demo call action-core test. Run with: tsx lib/demo-call/run.test.ts
 *
 * Proves: a valid request places end to end in mock mode and writes the call +
 * reservation rows; a request with the region spoofed in the body is rejected
 * server-side; and a budget denial never reaches CALL-E or writes rows.
 */
import assert from 'node:assert/strict'

import { runDemoCall } from './run'
import type { DemoCallDeps, DemoInvoice } from './run'
import type { BudgetStore, ReserveResult } from './budget'
import type { CalleClient, GetCallStatusResult, GetTranscriptResult, PlaceCallParams, PlaceCallResult } from '../calle/types'

const INVOICE: DemoInvoice = {
  id: 'inv-1',
  user_id: 'user-1',
  client_name: 'Test Client',
  amount: 4500,
  currency: 'USD',
  due_date: new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10),
  language_preference: 'en',
}

type Counts = { reserve: number; place: number; finalize: number; arrangement: number; callRow: number }

function makeDeps(reserve: ReserveResult): { deps: DemoCallDeps; counts: Counts } {
  const counts: Counts = { reserve: 0, place: 0, finalize: 0, arrangement: 0, callRow: 0 }
  const store: BudgetStore = {
    async reserve() {
      counts.reserve++
      return reserve
    },
    async finalize() {
      counts.finalize++
    },
    async snapshot(budget) {
      return { total: budget, used: 0, remaining: budget }
    },
  }
  const calle: CalleClient = {
    async placeCall(_p: PlaceCallParams): Promise<PlaceCallResult> {
      counts.place++
      return { callId: 'call_mock', status: 'queued', createdAt: new Date().toISOString() }
    },
    async getCallStatus(): Promise<GetCallStatusResult> {
      throw new Error('not used')
    },
    async getTranscript(): Promise<GetTranscriptResult> {
      throw new Error('not used')
    },
  }
  const deps: DemoCallDeps = {
    budget: 60,
    ipHash: 'iphash',
    store,
    calle,
    async getInvoice(id) {
      return id === INVOICE.id ? INVOICE : null
    },
    sink: {
      async createApprovedArrangement() {
        counts.arrangement++
        return { id: 'arr-1' }
      },
      async insertCallRow() {
        counts.callRow++
        return { id: 'callrow-1' }
      },
    },
  }
  return { deps, counts }
}

async function run(): Promise<void> {
  // ── Valid request → places end to end, writes rows ──────────────────────────
  {
    const { deps, counts } = makeDeps({ allowed: true, callId: 'res-1', remaining: 59 })
    const r = await runDemoCall(deps, { invoiceId: 'inv-1', phone: '+8801711000000', region: 'BD' })
    assert.ok(r.ok, 'valid request succeeds')
    assert.equal(counts.reserve, 1, 'reserved once')
    assert.equal(counts.place, 1, 'CALL-E placeCall invoked once')
    assert.equal(counts.arrangement, 1, 'draft arrangement written')
    assert.equal(counts.callRow, 1, 'calls row written')
    assert.equal(counts.finalize, 1, 'demo_calls reservation finalized')
    assert.ok(r.ok && r.masked.includes('*'), 'destination stored masked')
  }

  // ── Region spoofed in the request body → rejected, nothing happens ──────────
  {
    const { deps, counts } = makeDeps({ allowed: true, callId: 'res-1' })
    const r = await runDemoCall(deps, { invoiceId: 'inv-1', phone: '+8801711000000', region: 'US' })
    assert.ok(!r.ok && r.kind === 'validation', 'spoofed region rejected')
    assert.equal(counts.reserve, 0, 'no reservation on invalid input')
    assert.equal(counts.place, 0, 'CALL-E never called on invalid input')
    assert.equal(counts.callRow, 0, 'no rows written on invalid input')
  }

  // ── Budget denial → never reaches CALL-E, no rows ───────────────────────────
  {
    const { deps, counts } = makeDeps({ allowed: false, reason: 'budget_exhausted' })
    const r = await runDemoCall(deps, { invoiceId: 'inv-1', phone: '+8801711000000' })
    assert.ok(!r.ok && r.kind === 'budget', 'budget denial surfaced')
    assert.equal(counts.reserve, 1, 'reservation attempted')
    assert.equal(counts.place, 0, 'CALL-E never called when budget denied')
    assert.equal(counts.arrangement, 0, 'no arrangement when denied')
    assert.equal(counts.callRow, 0, 'no calls row when denied')
  }

  // ── Unknown invoice id → not_found, before any reservation ──────────────────
  {
    const { deps, counts } = makeDeps({ allowed: true, callId: 'res-1' })
    const r = await runDemoCall(deps, { invoiceId: 'nope', phone: '+8801711000000' })
    assert.ok(!r.ok && r.kind === 'not_found', 'unknown invoice rejected')
    assert.equal(counts.reserve, 0, 'no reservation for unknown invoice')
    assert.equal(counts.place, 0, 'CALL-E never called for unknown invoice')
  }

  console.log('\n✓ demo call core: valid places + writes rows; spoof/denied/not-found never touch CALL-E\n')
}

run().catch((err: unknown) => {
  console.error('FAIL', err)
  process.exitCode = 1
})
