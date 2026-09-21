/**
 * Dialer test. Run with: tsx lib/queue/dialer.test.ts
 *
 * Covers the done_when cases at the runDialer boundary (the DB claim's concurrency
 * is verified live against staging):
 *   - two dialer invocations sharing one claim place exactly one call,
 *   - an entry out of calling hours does not dial until the window opens,
 *   - a failed call retries once then lands as error, linking a calls row,
 *   - every completed/errored entry records a calls row,
 *   - an invoice edited to an unsupported number does not dial.
 */
import assert from 'node:assert/strict'

import { runDialer, DEFAULT_DIALER_CONFIG } from './dialer'
import type { ClaimedCall, CompletedRecord, DialerDeps, DialerInvoice } from './dialer'
import type {
  CalleClient,
  GetCallStatusResult,
  GetTranscriptResult,
  PlaceCallParams,
  PlaceCallResult,
} from '../calle/types'

const ALL_DAY = { startHour: 0, endHour: 24 }
const NOW = new Date('2026-08-04T16:00:00Z')

function invoice(over: Partial<DialerInvoice> = {}): DialerInvoice {
  return {
    id: 'inv-1',
    user_id: 'user-1',
    client_name: 'Test Client',
    amount: 5200,
    currency: 'USD',
    due_date: '2026-06-25',
    language_preference: 'en',
    client_phone: '+15550100201',
    client_region: 'US',
    ...over,
  }
}

function claim(over: Partial<ClaimedCall> = {}): ClaimedCall {
  return {
    id: 'q-1',
    invoice_id: 'inv-1',
    user_id: 'user-1',
    to_phone: '+15550100201',
    to_region: 'US',
    script: 'Hello, this is an automated call from Devixus Finance on behalf of a client.',
    attempts: 1,
    ...over,
  }
}

interface Spies {
  place: number
  completed: CompletedRecord[]
  released: string[]
}

function okCalle(spies: Spies): CalleClient {
  return {
    async placeCall(_p: PlaceCallParams): Promise<PlaceCallResult> {
      spies.place++
      return { callId: 'call_ok', status: 'queued', createdAt: NOW.toISOString() }
    },
    async getCallStatus(): Promise<GetCallStatusResult> {
      return {
        callId: 'call_ok',
        status: 'completed',
        durationSeconds: 120,
        outcome: 'paid_now',
        paymentDate: null,
        startedAt: NOW.toISOString(),
        endedAt: NOW.toISOString(),
      }
    },
    async getTranscript(): Promise<GetTranscriptResult> {
      return { callId: 'call_ok', entries: [], summary: 'Client paid.' }
    },
  }
}

function failingCalle(spies: Spies): CalleClient {
  return {
    async placeCall(): Promise<PlaceCallResult> {
      spies.place++
      throw new Error('CALL-E unreachable — simulated failure')
    },
    async getCallStatus(): Promise<GetCallStatusResult> {
      throw new Error('not used')
    },
    async getTranscript(): Promise<GetTranscriptResult> {
      throw new Error('not used')
    },
  }
}

function makeDeps(opts: {
  claims: Array<ClaimedCall | null>
  calle: (s: Spies) => CalleClient
  now?: Date
  callingHours?: { startHour: number; endHour: number }
  loadInvoice?: DialerInvoice | null
}): { deps: DialerDeps; spies: Spies } {
  const spies: Spies = { place: 0, completed: [], released: [] }
  const queue = [...opts.claims]
  const deps: DialerDeps = {
    now: opts.now ?? NOW,
    config: { ...DEFAULT_DIALER_CONFIG, callingHours: opts.callingHours ?? ALL_DAY },
    allRegions: ['US'],
    calle: opts.calle(spies),
    async claimNext() {
      return queue.length > 0 ? queue.shift()! : null
    },
    async loadInvoice() {
      return opts.loadInvoice === undefined ? invoice() : opts.loadInvoice
    },
    async recordCompleted(rec) {
      spies.completed.push(rec)
    },
    async releaseForRetry(entryId) {
      spies.released.push(entryId)
    },
  }
  return { deps, spies }
}

async function run(): Promise<void> {
  // ── Two invocations sharing one claim → exactly one call placed ─────────────
  {
    const spies: Spies = { place: 0, completed: [], released: [] }
    const queue: Array<ClaimedCall | null> = [claim(), null] // first claims it, second gets nothing
    const shared: DialerDeps = {
      now: NOW,
      config: { ...DEFAULT_DIALER_CONFIG, callingHours: ALL_DAY },
      allRegions: ['US'],
      calle: okCalle(spies),
      async claimNext() {
        return queue.length > 0 ? queue.shift()! : null
      },
      async loadInvoice() {
        return invoice()
      },
      async recordCompleted(rec) {
        spies.completed.push(rec)
      },
      async releaseForRetry(id) {
        spies.released.push(id)
      },
    }
    const first = await runDialer(shared)
    const second = await runDialer(shared)
    assert.ok(first.placed, 'first invocation places the call')
    assert.ok(!second.placed && second.reason === 'none_due', 'second invocation places nothing')
    assert.equal(spies.place, 1, 'exactly one call placed across the two invocations')
    assert.equal(spies.completed.length, 1, 'exactly one calls row recorded')
  }

  // ── Out of calling hours → does not dial (claim never even attempted) ───────
  {
    // 07:00 UTC → US(NY) 03:00, outside 10–18.
    const { deps, spies } = makeDeps({
      claims: [claim()],
      calle: okCalle,
      now: new Date('2026-08-04T07:00:00Z'),
      callingHours: { startHour: 10, endHour: 18 },
    })
    const r = await runDialer(deps)
    assert.ok(!r.placed && r.reason === 'out_of_hours', 'out of hours → no dial')
    assert.equal(spies.place, 0, 'CALL-E not called out of hours')

    // Same entry, a time inside the window → it dials.
    const { deps: deps2, spies: spies2 } = makeDeps({
      claims: [claim()],
      calle: okCalle,
      now: new Date('2026-08-04T16:00:00Z'), // NY 12:00
      callingHours: { startHour: 10, endHour: 18 },
    })
    const r2 = await runDialer(deps2)
    assert.ok(r2.placed, 'in-hours → dials once the window opens')
    assert.equal(spies2.place, 1, 'one call placed in hours')
  }

  // ── A failed call retries once, then lands as error (with a calls row) ──────
  {
    // First attempt (attempts=1): fails → released for retry.
    const { deps: d1, spies: s1 } = makeDeps({ claims: [claim({ attempts: 1 })], calle: failingCalle })
    const r1 = await runDialer(d1)
    assert.ok(!r1.placed && r1.reason === 'failed_retry', 'first failure → retry')
    assert.deepEqual(s1.released, ['q-1'], 'lease released for retry')
    assert.equal(s1.completed.length, 0, 'no terminal record yet')

    // Second attempt (attempts=2): fails → recorded as error (links a calls row).
    const { deps: d2, spies: s2 } = makeDeps({ claims: [claim({ attempts: 2 })], calle: failingCalle })
    const r2 = await runDialer(d2)
    assert.ok(!r2.placed && r2.reason === 'failed_error', 'second failure → error')
    assert.equal(s2.released.length, 0, 'not released again')
    assert.equal(s2.completed.length, 1, 'a calls row is recorded for the errored entry')
    assert.equal(s2.completed[0].outcome, 'error', 'outcome is error')
    assert.equal(s2.completed[0].calleCallId, null, 'no CALL-E id on a failed placement')
  }

  // ── Success path records the outcome + links a calls row ────────────────────
  {
    const { deps, spies } = makeDeps({ claims: [claim()], calle: okCalle })
    const r = await runDialer(deps)
    assert.ok(r.placed && r.outcome === 'paid', 'paid_now maps to paid')
    assert.equal(spies.completed.length, 1, 'one calls row')
    assert.equal(spies.completed[0].calleCallId, 'call_ok', 'calls row links the CALL-E id')
  }

  // ── Invoice edited to an unsupported number after drafting → does not dial ──
  {
    const { deps, spies } = makeDeps({
      claims: [claim()],
      calle: okCalle,
      loadInvoice: invoice({ client_phone: '+9990001', client_region: null }), // unsupported
    })
    const r = await runDialer(deps)
    assert.ok(!r.placed && r.reason === 'invalid_destination', 'edited-to-unsupported does not dial')
    assert.equal(spies.place, 0, 'CALL-E never called for an invalid destination')
    assert.equal(spies.completed.length, 1, 'the entry is recorded (error), not left dialing')
    assert.equal(spies.completed[0].outcome, 'error', 'invalid destination records error')
  }

  console.log(
    '\n✓ dialer: two ticks place exactly one call; out-of-hours defers; fail retries once then errors; success + invalid-destination both link a calls row\n',
  )
}

run().catch((err: unknown) => {
  console.error('FAIL', err)
  process.exitCode = 1
})
