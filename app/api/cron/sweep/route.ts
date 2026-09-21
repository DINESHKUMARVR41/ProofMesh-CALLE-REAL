// Vercel Cron entry for the threshold sweep. Scheduled in vercel.json; protected
// by CRON_SECRET (isAuthorizedCron fails closed if the secret is unset). Also
// runnable locally via `pnpm sweep`, which shares the same runSweep/deps path.
//
// The sweep only DRAFTS calls — it never dials. Drafts wait on the /queue page for
// a human batch-approval before the dialer can place them.
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/guard'
import { createSupabaseServer } from '@/lib/supabase/server'
import { runSweep, sweepConfigFromEnv } from '@/lib/queue/sweep'
import { supabaseSweepDeps } from '@/lib/queue/sweep-supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const supabase = createSupabaseServer()
    const result = await runSweep(supabaseSweepDeps(supabase, new Date(), sweepConfigFromEnv()))
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sweep failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
