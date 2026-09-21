/**
 * Dialer — local/demo runner. Places at most ONE approved call (the next due,
 * in-hours, under-cap entry), records the outcome, links a calls row.
 *
 *   pnpm dial
 *
 * Same runDialer + supabaseDialerDeps path as the Vercel cron route. Honors
 * CALLE_MODE (mock by default) via getCalleClient — a bare run never places a real
 * call. Pass --loop to keep dialing until nothing is due (respects one-at-a-time).
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/types/database'
import { getCalleClient } from '../lib/calle'
import { SUPPORTED_REGIONS } from '../lib/calle/regions'
import { runDialer, dialerConfigFromEnv } from '../lib/queue/dialer'
import { supabaseDialerDeps } from '../lib/queue/dialer-supabase'

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
    console.error('dial: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
    process.exit(1)
  }
  const loop = process.argv.includes('--loop')
  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let ticks = 0
  for (;;) {
    const result = await runDialer(
      supabaseDialerDeps(supabase, getCalleClient(), new Date(), dialerConfigFromEnv(), [...SUPPORTED_REGIONS]),
    )
    ticks++
    console.log(`tick ${ticks}: ${JSON.stringify(result)}`)
    if (!loop) break
    if (!result.placed && (result.reason === 'none_due' || result.reason === 'out_of_hours')) break
  }
  console.log('dial complete.')
}

main().catch((err: unknown) => {
  console.error('dial failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
