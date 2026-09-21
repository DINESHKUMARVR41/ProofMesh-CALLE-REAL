/**
 * seed-demo — truncate and re-seed the three core tables with fictional demo data.
 *
 * Data mirrors supabase/seed/demo.sql exactly. All names, amounts, and phone numbers
 * are invented; phone numbers are from documented fictional/reserved ranges
 * (see demo.sql header for sources).
 *
 * Usage:  pnpm seed-demo [--yes]
 *
 * Without --yes the script prints the target URL and exits without touching the DB.
 * With    --yes it deletes all rows from arrangements, calls, and invoices (FK order),
 * then re-inserts the seed rows.
 *
 * DEMO PROJECT ONLY — never run against production.
 */

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(): void {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\r$/, '')
  }
}
loadEnv()

// Deletion order respects FK constraints (children before parents).
const DELETE_ORDER = ['arrangements', 'calls', 'invoices'] as const

// Fixed UUIDs — must match demo.sql so re-running is idempotent.
const INV = {
  pending:  'deed0001-0000-0000-0000-000000000000',
  recent:   'deed0002-0000-0000-0000-000000000000',
  bad:      'deed0003-0000-0000-0000-000000000000',
  disputed: 'deed0004-0000-0000-0000-000000000000',
  paid:     'deed0005-0000-0000-0000-000000000000',
  arranged: 'deed0006-0000-0000-0000-000000000000',
  large:    'deed0007-0000-0000-0000-000000000000',
} as const

const CALL_ID = {
  c01: 'ca110001-0000-0000-0000-000000000000',
  c02: 'ca110002-0000-0000-0000-000000000000',
  c03: 'ca110003-0000-0000-0000-000000000000',
  c04: 'ca110004-0000-0000-0000-000000000000',
  c05: 'ca110005-0000-0000-0000-000000000000',
  c06: 'ca110006-0000-0000-0000-000000000000',
} as const

const ARR = {
  marlowe:   'a2a00001-0000-0000-0000-000000000000',
  thornbury: 'a2a00002-0000-0000-0000-000000000000',
  ashford:   'a2a00003-0000-0000-0000-000000000000',
} as const

/** ISO date string (YYYY-MM-DD) offset from today by `days`. */
function dateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** ISO timestamp offset from now by `days`. */
function tsOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

/** Human-readable date (e.g. "6 Jul 2026"), matching the app's formatDate, for
 *  dates embedded in free-text fields — never an ISO string in customer-facing copy. */
function humanDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error(
      'seed-demo: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.',
    )
    process.exit(1)
  }

  const confirmed = process.argv.includes('--yes')

  console.log('Target project:', url)
  console.log('Tables:        arrangements, calls, invoices')
  console.log()

  if (!confirmed) {
    console.error(
      [
        'seed-demo: will DELETE all rows from arrangements, calls, and invoices,',
        '           then re-seed with fictional demo data (mirrors supabase/seed/demo.sql).',
        '',
        '           Pass --yes to confirm:',
        '             pnpm seed-demo --yes',
        '',
        '           DEMO PROJECT ONLY — never run against production.',
      ].join('\n'),
    )
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Resolve user_id — same logic as demo.sql: first user in auth.users.
  const listResult = await supabase.auth.admin.listUsers()
  if (listResult.error) {
    console.error('seed-demo: could not list auth users:', listResult.error.message)
    process.exit(1)
  }
  const { users } = listResult.data
  if (!users.length) {
    console.error(
      'seed-demo: no users in auth.users — sign up at the app first, then re-run.',
    )
    process.exit(1)
  }
  const userId = users[0].id
  console.log('Seeding as user_id:', userId)
  console.log()

  // ── Truncate (FK order: arrangements → calls → invoices) ─────────────────
  for (const table of DELETE_ORDER) {
    const { error } = await supabase.from(table).delete().not('id', 'is', null)
    if (error) {
      console.error(`seed-demo: failed to delete from ${table}:`, error.message)
      process.exit(1)
    }
    console.log(`  truncated  ${table}`)
  }
  console.log()

  // ── Invoices ──────────────────────────────────────────────────────────────
  const { error: invErr } = await supabase.from('invoices').insert([
    // created_at = due − 30 days, so "Added" always precedes the due date and
    // any call/arrangement on the invoice.
    {
      id: INV.pending, user_id: userId,
      client_name: 'Pemberton & Hale Ltd',
      amount: 3200.00, currency: 'USD', due_date: dateOffset(+20),
      status: 'pending', language_preference: 'en', created_at: tsOffset(+20 - 30),
    },
    {
      id: INV.recent, user_id: userId,
      client_name: 'Clearfield Digital Inc',
      amount: 5750.00, currency: 'USD', due_date: dateOffset(-14),
      status: 'overdue', language_preference: 'en', created_at: tsOffset(-14 - 30),
    },
    {
      id: INV.bad, user_id: userId,
      client_name: 'Whitmore Media Group LLC',
      amount: 8900.00, currency: 'USD', due_date: dateOffset(-52),
      status: 'overdue', language_preference: 'en', created_at: tsOffset(-52 - 30),
    },
    {
      id: INV.disputed, user_id: userId,
      client_name: 'Ashford Analytics Pty Ltd',
      amount: 2400.00, currency: 'USD', due_date: dateOffset(-30),
      status: 'disputed', language_preference: 'en', created_at: tsOffset(-30 - 30),
    },
    {
      id: INV.paid, user_id: userId,
      client_name: 'Thornbury Creative Pty Ltd',
      amount: 6100.00, currency: 'USD', due_date: dateOffset(-90),
      status: 'paid', language_preference: 'en', created_at: tsOffset(-90 - 30),
    },
    {
      id: INV.arranged, user_id: userId,
      client_name: 'Marlowe Digital Solutions Inc',
      amount: 4500.00, currency: 'USD', due_date: dateOffset(-28),
      status: 'arranged', language_preference: 'en', created_at: tsOffset(-28 - 30),
    },
    {
      id: INV.large, user_id: userId,
      client_name: 'Highfield Consulting Ltd',
      amount: 11200.00, currency: 'USD', due_date: dateOffset(-35),
      status: 'overdue', language_preference: 'en', created_at: tsOffset(-35 - 30),
    },
  ])
  if (invErr) {
    console.error('seed-demo: invoices insert failed:', invErr.message)
    process.exit(1)
  }
  console.log('  inserted   invoices (7 rows)')

  // ── Calls ─────────────────────────────────────────────────────────────────
  // Phone numbers are from documented fictional/reserved ranges — see demo.sql header.
  const { error: callErr } = await supabase.from('calls').insert([
    {
      id: CALL_ID.c01, invoice_id: INV.bad, user_id: userId,
      started_at: tsOffset(-18), duration_seconds: 38,
      calle_call_id: 'mock_hist_calle_001', outcome: 'no_answer',
      transcript_ref:
        'No answer at +15550100038 (Whitmore Media Group LLC). ' +
        'Voicemail not available. Call ended after 38 s.',
    },
    {
      id: CALL_ID.c02, invoice_id: INV.bad, user_id: userId,
      started_at: tsOffset(-11), duration_seconds: 72,
      calle_call_id: 'mock_hist_calle_002', outcome: 'callback',
      transcript_ref:
        'Spoke with accounts clerk at Whitmore Media Group LLC ' +
        '(+15550100038). AP manager unavailable; clerk requested ' +
        'a callback. Duration 72 s.',
    },
    {
      id: CALL_ID.c03, invoice_id: INV.paid, user_id: userId,
      started_at: tsOffset(-75), duration_seconds: 154,
      calle_call_id: 'mock_hist_calle_003', outcome: 'paid',
      transcript_ref:
        'James Thornbury at Thornbury Creative Pty Ltd ' +
        '(+61491570157) confirmed bank transfer of USD 6,100 ' +
        'completed same day. Invoice INV-0089 closed. Duration 154 s.',
    },
    {
      id: CALL_ID.c04, invoice_id: INV.arranged, user_id: userId,
      started_at: tsOffset(-5), duration_seconds: 203,
      calle_call_id: 'mock_hist_calle_004', outcome: 'committed',
      transcript_ref:
        'Sarah Marlowe at Marlowe Digital Solutions Inc ' +
        '(+15550100054) committed to full payment of USD 4,500 ' +
        `by ${humanDate(+7)}. Reference INV-0147. Duration 203 s.`,
    },
    {
      id: CALL_ID.c05, invoice_id: INV.disputed, user_id: userId,
      started_at: tsOffset(-20), duration_seconds: 118,
      calle_call_id: 'mock_hist_calle_005', outcome: 'disputed',
      transcript_ref:
        'Accounts contact at Ashford Analytics Pty Ltd ' +
        '(+61491570156) disputed invoice INV-0133 (USD 2,400), ' +
        'citing a scope disagreement. Escalated to email within ' +
        '1 business day per dispute protocol. Duration 118 s.',
    },
    {
      id: CALL_ID.c06, invoice_id: INV.large, user_id: userId,
      started_at: tsOffset(-3), duration_seconds: 42,
      calle_call_id: 'mock_hist_calle_006', outcome: 'no_answer',
      transcript_ref:
        'No answer at +447700900315 (Highfield Consulting Ltd). ' +
        'Voicemail box full. Duration 42 s. Follow-up required for ' +
        'INV-0162 (USD 11,200, 35 days overdue).',
    },
  ])
  if (callErr) {
    console.error('seed-demo: calls insert failed:', callErr.message)
    process.exit(1)
  }
  console.log('  inserted   calls (6 rows)')

  // ── Arrangements ──────────────────────────────────────────────────────────
  const { error: arrErr } = await supabase.from('arrangements').insert([
    {
      id: ARR.marlowe, invoice_id: INV.arranged, user_id: userId,
      proposed_terms:
        `Full payment of USD 4,500 by ${humanDate(+7)} via bank transfer. ` +
        'Reference: INV-0147.',
      human_approved: true, client_agreed: true, status: 'executed',
      created_at: tsOffset(-6),
      approved_at: tsOffset(-6), rejected_at: null, executed_at: tsOffset(-5),
    },
    {
      id: ARR.thornbury, invoice_id: INV.paid, user_id: userId,
      proposed_terms:
        'Immediate full payment of USD 6,100 via bank transfer. ' +
        'Reference: INV-0089.',
      human_approved: true, client_agreed: true, status: 'executed',
      created_at: tsOffset(-76),
      approved_at: tsOffset(-76), rejected_at: null, executed_at: tsOffset(-75),
    },
    {
      id: ARR.ashford, invoice_id: INV.disputed, user_id: userId,
      proposed_terms:
        `Full payment of USD 2,400 by ${humanDate(-15)}. ` +
        'Reference: INV-0133.',
      human_approved: true, client_agreed: false, status: 'rejected',
      created_at: tsOffset(-21),
      approved_at: tsOffset(-21), rejected_at: tsOffset(-19), executed_at: null,
    },
  ])
  if (arrErr) {
    console.error('seed-demo: arrangements insert failed:', arrErr.message)
    process.exit(1)
  }
  console.log('  inserted   arrangements (3 rows)')

  console.log()
  console.log('seed-demo OK — demo project re-seeded.')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
