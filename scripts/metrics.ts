/**
 * Report call metrics for an invoice-recovery campaign from the `calls` table.
 *
 * Usage:
 *   pnpm metrics                       (reads staging from .env)
 *   pnpm metrics --since 2026-08-01    (campaign window: calls started on/after this)
 *   pnpm metrics --until 2026-08-31    (campaign window: calls started on/before this)
 *   pnpm metrics --tag CAMPAIGN_AUG    (calls whose calle_call_id starts with this tag)
 *   pnpm metrics --mock                (in-memory synthetic data; no DB needed)
 *   pnpm metrics --mock --empty        (empty dataset — every metric is insufficient data)
 *
 * NEVER places a call (forces CALLE_MODE=mock; the script only reads).
 *
 * Metrics:
 *   - Calls placed:        count of matching rows
 *   - Completion rate:     rows that reached a client conversation
 *                          (paid | committed | disputed | refused) over calls placed
 *   - Median call duration: median duration_seconds across rows that recorded one
 *   - Median conversational latency: per-turn agent response latency. The `calls`
 *                          schema does NOT persist transcript turn timing, so real/
 *                          staging runs report 'insufficient data' for this until it
 *                          is captured — never a fabricated number. (--mock carries a
 *                          synthetic value only to prove the median computes.)
 *   - Outcome breakdown:   per-branch counts via the mapped DB outcome (mapCalleOutcome),
 *                          the four branches called out explicitly.
 *
 * HONESTY RULE: a metric with no underlying rows prints 'insufficient data'. A count
 * of 0 for a branch is printed only when calls were placed (a measured zero); with no
 * calls placed at all, every metric is 'insufficient data', never 0-as-though-measured.
 */

// Safety: this script never places a real call.
process.env.CALLE_MODE = 'mock'

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/types/database'

// ── Load .env so `pnpm metrics` reaches staging without exported vars ─────────
function loadEnv(): void {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\r$/, '')
  }
}
loadEnv()

// ── Types ────────────────────────────────────────────────────────────────────

interface CallRecord {
  outcome: string | null
  duration_seconds: number | null
  /** Per-turn agent response latency (ms). Not in the calls schema; DB rows carry null. */
  conversational_latency_ms: number | null
}

/** Outcomes where the client engaged in the recovery conversation (the four branches). */
const ENGAGED_OUTCOMES = new Set(['paid', 'committed', 'disputed', 'refused'])

/** DB outcome -> display label (raw skill branch in parens where they differ). */
const OUTCOME_LABELS: Array<{ db: string; label: string }> = [
  { db: 'paid', label: 'paid_now' },
  { db: 'committed', label: 'committed_to_date' },
  { db: 'disputed', label: 'disputed' },
  { db: 'refused', label: 'refused' },
  { db: 'no_answer', label: 'no_answer' },
  { db: 'callback', label: 'voicemail / wrong_person' },
  { db: 'error', label: 'error' },
]

// ── Mock data ────────────────────────────────────────────────────────────────

/**
 * Representative records for --mock runs (synthetic; clearly not from the DB).
 * conversational_latency_ms is present here ONLY to prove the median computes;
 * real DB rows never carry it (see header).
 */
const MOCK_CALLS: CallRecord[] = [
  { outcome: 'committed', duration_seconds: 142, conversational_latency_ms: 900 },
  { outcome: 'no_answer', duration_seconds: 8, conversational_latency_ms: null },
  { outcome: 'paid', duration_seconds: 97, conversational_latency_ms: 780 },
  { outcome: 'committed', duration_seconds: 183, conversational_latency_ms: 1020 },
  { outcome: 'refused', duration_seconds: 54, conversational_latency_ms: 840 },
]

// ── Math helpers ─────────────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? null
  const lo = sorted[mid - 1]
  const hi = sorted[mid]
  return lo !== undefined && hi !== undefined ? (lo + hi) / 2 : null
}

// ── Reporting ─────────────────────────────────────────────────────────────────

const LABEL_WIDTH = 32
const INSUFFICIENT = 'insufficient data'

function report(label: string, value: string): void {
  console.log(`  ${label.padEnd(LABEL_WIDTH)}: ${value}`)
}

function computeAndPrint(rows: CallRecord[]): void {
  const total = rows.length

  // No rows at all → every metric is insufficient data (never 0-as-though-measured).
  if (total === 0) {
    for (const label of [
      'Calls placed',
      'Completion rate',
      'Median call duration',
      'Median conversational latency',
      'Outcome breakdown',
    ]) {
      report(label, INSUFFICIENT)
    }
    return
  }

  report('Calls placed', String(total))

  const engaged = rows.filter((r) => r.outcome !== null && ENGAGED_OUTCOMES.has(r.outcome)).length
  report('Completion rate', `${((engaged / total) * 100).toFixed(1)}% (${engaged}/${total} reached a conversation)`)

  const durations = rows.map((r) => r.duration_seconds).filter((d): d is number => d !== null)
  const medDuration = median(durations)
  report('Median call duration', medDuration !== null ? `${medDuration}s (n=${durations.length})` : INSUFFICIENT)

  const latencies = rows.map((r) => r.conversational_latency_ms).filter((l): l is number => l !== null)
  const medLatency = median(latencies)
  report('Median conversational latency', medLatency !== null ? `${medLatency}ms (n=${latencies.length})` : INSUFFICIENT)

  // Outcome breakdown — measured counts (a 0 here is a measured zero, total > 0).
  console.log(`  ${'Outcome breakdown'.padEnd(LABEL_WIDTH)}:`)
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.outcome ?? '(none)', (counts.get(r.outcome ?? '(none)') ?? 0) + 1)
  for (const { db, label } of OUTCOME_LABELS) {
    console.log(`      ${`${label}`.padEnd(26)} ${counts.get(db) ?? 0}`)
    counts.delete(db)
  }
  // Any unexpected outcome value still present in the data.
  for (const [outcome, n] of counts) {
    console.log(`      ${`${outcome} (unmapped)`.padEnd(26)} ${n}`)
  }
}

// ── DB fetch ──────────────────────────────────────────────────────────────────

interface Filters {
  since: string | null
  until: string | null
  tag: string | null
}

async function fetchFromDb(url: string, key: string, filters: Filters): Promise<CallRecord[]> {
  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let query = supabase.from('calls').select('outcome, duration_seconds, started_at, calle_call_id')
  if (filters.since) query = query.gte('started_at', filters.since)
  if (filters.until) query = query.lte('started_at', filters.until)
  if (filters.tag) query = query.like('calle_call_id', `${filters.tag}%`)

  const { data, error } = await query
  if (error) throw new Error(`DB query failed: ${error.message}`)

  return (data ?? []).map((row) => ({
    outcome: row.outcome,
    duration_seconds: row.duration_seconds,
    conversational_latency_ms: null, // not persisted in the calls schema
  }))
}

// ── Main ──────────────────────────────────────────────────────────────────────

function flagValue(args: string[], name: string): string | null {
  const i = args.indexOf(`--${name}`)
  if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1]
  const eq = args.find((a) => a.startsWith(`--${name}=`))
  return eq ? eq.slice(name.length + 3) : null
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const useMock = args.includes('--mock')
  const isEmpty = args.includes('--empty')
  const filters: Filters = {
    since: flagValue(args, 'since'),
    until: flagValue(args, 'until'),
    tag: flagValue(args, 'tag'),
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  let rows: CallRecord[]
  let source: string

  if (isEmpty) {
    rows = []
    source = 'mock (empty)'
  } else if (useMock || !url || !key) {
    rows = MOCK_CALLS
    source = url && key ? 'mock' : 'mock (no DB env — falling back)'
  } else {
    rows = await fetchFromDb(url, key, filters)
    source = 'live (calls table)'
  }

  const scope: string[] = []
  if (filters.since) scope.push(`since ${filters.since}`)
  if (filters.until) scope.push(`until ${filters.until}`)
  if (filters.tag) scope.push(`tag ${filters.tag}*`)

  console.log(`\nCALL-E Invoice Recovery — Campaign Metrics`)
  console.log(`source: ${source}${scope.length ? ` · ${scope.join(' · ')}` : ''}\n`)
  computeAndPrint(rows)
  console.log('')
}

main().catch((err: unknown) => {
  console.error('Error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
