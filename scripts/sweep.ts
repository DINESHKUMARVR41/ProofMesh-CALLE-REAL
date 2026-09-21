/**
 * Threshold sweep — local/demo runner. Drafts recovery calls for invoices that
 * have crossed an overdue threshold (never dials; drafts wait for approval).
 *
 *   pnpm sweep
 *
 * Uses the SAME runSweep + supabaseSweepDeps path as the Vercel cron route, so
 * local behaviour matches production. Reads NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY and the QUEUE_* config from the environment / .env.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/types/database'
import { runSweep, sweepConfigFromEnv } from '../lib/queue/sweep'
import { supabaseSweepDeps } from '../lib/queue/sweep-supabase'

function loadEnv(): void {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\r$/, '')
  }
}
loadEnv()

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('sweep: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
    process.exit(1)
  }

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const config = sweepConfigFromEnv()
  console.log(
    `sweep: thresholds=[${config.thresholdsDays.join(',')}]d recentCall=${config.recentCallDays}d ttl=${config.draftTtlHours}h`,
  )

  const result = await runSweep(supabaseSweepDeps(supabase, new Date(), config))

  console.log(`\n  expired    ${result.expired}`)
  console.log(`  drafted    ${result.drafted}`)
  console.log(`  duplicates ${result.duplicates}`)
  const byReason = new Map<string, number>()
  for (const s of result.skipped) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1)
  console.log('  skipped:')
  if (byReason.size === 0) console.log('    (none)')
  for (const [reason, count] of byReason) console.log(`    ${reason.padEnd(20)} ${count}`)
  console.log('\nsweep complete.')
}

main().catch((err: unknown) => {
  console.error('sweep failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
