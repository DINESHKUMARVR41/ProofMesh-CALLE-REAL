/**
 * Threshold sweep planner test. Run with: tsx lib/queue/sweep.test.ts
 *
 * Covers the done_when cases:
 *   - a 40-day-overdue invoice gets exactly one draft (with the disclosure script),
 *   - running the sweep again (open entry now exists) drafts nothing,
 *   - a paid invoice never drafts (nor disputed/arranged),
 *   - an overdue invoice with no phone is surfaced (no_phone), not silently dropped,
 *   - a recent call suppresses drafting.
 * The no-double-draft-under-concurrency guarantee is the partial unique index; its
 * live behaviour is verified separately against staging.
 */
import assert from 'node:assert/strict'

import { planSweep, runSweep, DEFAULT_SWEEP_CONFIG } from './sweep'
import type { DraftPlan, SweepDeps, SweepFacts, SweepInvoice } from './sweep'
import { AUTOMATED_DISCLOSURE } from '../calls/generate-script'

const NOW = new Date('2026-08-04T12:00:00Z')

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10)
}

function invoice(over: Partial<SweepInvoice>): SweepInvoice {
  return {
    id: 'inv-x',
    user_id: 'user-1',
    client_name: 'Test Client',
    amount: 4500,
    currency: 'USD',
    due_date: daysAgo(40),
    status: 'overdue',
    language_preference: 'en',
    client_phone: '+15550100038',
    client_region: 'US',
    ...over,
  }
}

const NO_FACTS: SweepFacts = {
  openQueueInvoiceIds: new Set(),
  recentCallInvoiceIds: new Set(),
}

function run(): void {
  // ── A 40-day-overdue invoice with a valid phone → exactly one draft ─────────
  {
    const inv = invoice({ id: 'inv-40' })
    const { drafts, skipped } = planSweep([inv], NO_FACTS, DEFAULT_SWEEP_CONFIG, NOW)
    assert.equal(drafts.length, 1, '40d overdue drafts once')
    assert.equal(skipped.length, 0, 'nothing skipped')
    assert.equal(drafts[0].toPhone, '+15550100038', 'destination snapshotted')
    assert.equal(drafts[0].toRegion, 'US', 'region derived + snapshotted')
    assert.ok(drafts[0].script.includes(AUTOMATED_DISCLOSURE), 'script opens with the disclosure')
    assert.ok(drafts[0].expiresAt.getTime() > NOW.getTime(), 'expiry is in the future')
  }

  // ── Second run: an open entry already exists → drafts nothing ───────────────
  {
    const inv = invoice({ id: 'inv-40' })
    const facts: SweepFacts = { openQueueInvoiceIds: new Set(['inv-40']), recentCallInvoiceIds: new Set() }
    const { drafts, skipped } = planSweep([inv], facts, DEFAULT_SWEEP_CONFIG, NOW)
    assert.equal(drafts.length, 0, 'no second draft when an open entry exists')
    assert.deepEqual(skipped, [{ invoiceId: 'inv-40', reason: 'open_entry' }], 'skipped as open_entry')
  }

  // ── Paid / disputed / arranged never draft, even if overdue with a phone ────
  for (const status of ['paid', 'disputed', 'arranged']) {
    const inv = invoice({ id: `inv-${status}`, status })
    const { drafts, skipped } = planSweep([inv], NO_FACTS, DEFAULT_SWEEP_CONFIG, NOW)
    assert.equal(drafts.length, 0, `${status} never drafts`)
    assert.equal(skipped[0]?.reason, 'excluded_status', `${status} skipped as excluded_status`)
  }

  // ── Overdue invoice with no phone → surfaced as no_phone (not dropped) ───────
  {
    const inv = invoice({ id: 'inv-nophone', client_phone: null, client_region: null })
    const { drafts, skipped } = planSweep([inv], NO_FACTS, DEFAULT_SWEEP_CONFIG, NOW)
    assert.equal(drafts.length, 0, 'no draft without a phone')
    assert.deepEqual(skipped, [{ invoiceId: 'inv-nophone', reason: 'no_phone' }], 'reported as no_phone')
  }

  // ── Has a phone but it does not validate → unsupported_number ────────────────
  {
    const inv = invoice({ id: 'inv-bad', client_phone: '+9990000', client_region: null })
    const { drafts, skipped } = planSweep([inv], NO_FACTS, DEFAULT_SWEEP_CONFIG, NOW)
    assert.equal(drafts.length, 0, 'no draft for an unvalidatable number')
    assert.equal(skipped[0]?.reason, 'unsupported_number', 'reported as unsupported_number')
  }

  // ── A recent call suppresses drafting (cadence) ─────────────────────────────
  {
    const inv = invoice({ id: 'inv-recent' })
    const facts: SweepFacts = { openQueueInvoiceIds: new Set(), recentCallInvoiceIds: new Set(['inv-recent']) }
    const { drafts, skipped } = planSweep([inv], facts, DEFAULT_SWEEP_CONFIG, NOW)
    assert.equal(drafts.length, 0, 'no draft when a call was placed recently')
    assert.equal(skipped[0]?.reason, 'recent_call', 'reported as recent_call')
  }

  // ── Not yet across the minimum threshold → not_overdue ──────────────────────
  {
    const inv = invoice({ id: 'inv-fresh', due_date: daysAgo(3) })
    const { drafts, skipped } = planSweep([inv], NO_FACTS, DEFAULT_SWEEP_CONFIG, NOW)
    assert.equal(drafts.length, 0, '3d overdue is below the 7d threshold')
    assert.equal(skipped[0]?.reason, 'not_overdue', 'reported as not_overdue')
  }

  console.log(
    '\n✓ sweep planner: 40d drafts once; re-run drafts nothing; paid/disputed/arranged never draft; no-phone surfaced; recent-call + below-threshold suppressed\n',
  )
}

async function runResultShape(): Promise<void> {
  // runSweep expires stale drafts first, then inserts. A raced insert that the
  // partial unique index rejects is reported as a duplicate, not a crash.
  const draftable = [invoice({ id: 'inv-a' }), invoice({ id: 'inv-b' })]
  const inserts: string[] = []
  const deps: SweepDeps = {
    now: NOW,
    config: DEFAULT_SWEEP_CONFIG,
    async expireStaleDrafts() {
      return 2
    },
    async listInvoices() {
      return [...draftable, invoice({ id: 'inv-paid', status: 'paid' })]
    },
    async loadFacts() {
      return { openQueueInvoiceIds: new Set(), recentCallInvoiceIds: new Set() }
    },
    async insertDraft(plan: DraftPlan) {
      inserts.push(plan.invoice.id)
      return plan.invoice.id === 'inv-b' ? 'duplicate' : 'inserted' // simulate a race on inv-b
    },
  }
  const result = await runSweep(deps)
  assert.equal(result.expired, 2, 'stale drafts expired count surfaced')
  assert.equal(result.drafted, 1, 'one draft inserted')
  assert.equal(result.duplicates, 1, 'raced insert counted as duplicate, not an error')
  assert.deepEqual(inserts.sort(), ['inv-a', 'inv-b'], 'only draftable invoices attempted (paid skipped)')
  assert.ok(
    result.skipped.some((s) => s.invoiceId === 'inv-paid' && s.reason === 'excluded_status'),
    'paid invoice reported skipped',
  )
  console.log('✓ runSweep: expires first, inserts draftable, counts a raced insert as duplicate\n')
}

async function main(): Promise<void> {
  run()
  await runResultShape()
}

main().catch((err: unknown) => {
  console.error('FAIL', err)
  process.exitCode = 1
})
