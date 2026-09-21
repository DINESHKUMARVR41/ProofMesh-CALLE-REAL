// Vercel Cron entry for the dialer. Scheduled frequently in vercel.json (each tick
// places at most one call); protected by CRON_SECRET (fail-closed). Also runnable
// via `pnpm dial`, sharing the same runDialer/deps path.
//
// CALLE_MODE governs whether a real call is placed — it stays 'mock' until the
// operator flips it (see DEPLOY.md / HANDOFF-STATE). The dialer never bypasses that.
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/guard'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getCalleClient } from '@/lib/calle'
import { SUPPORTED_REGIONS } from '@/lib/calle/regions'
import { runDialer, dialerConfigFromEnv } from '@/lib/queue/dialer'
import { supabaseDialerDeps } from '@/lib/queue/dialer-supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const supabase = createSupabaseServer()
    const result = await runDialer(
      supabaseDialerDeps(supabase, getCalleClient(), new Date(), dialerConfigFromEnv(), [...SUPPORTED_REGIONS]),
    )
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'dial failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
