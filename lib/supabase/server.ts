// Server-side Supabase client — service-role key.
// Import ONLY in Server Components, Route Handlers, and Server Actions.
// Never import this from a 'use client' file.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Hard ceiling on any single Supabase read. The pages are force-dynamic and
// await these reads at request time; without a cap, an upstream blip (DB restart,
// network) blocks the whole route until the platform function times out. With it,
// a slow read aborts and falls into the page's existing ErrorState within seconds.
export const QUERY_TIMEOUT_MS = 4000

/** AbortSignal that fires after QUERY_TIMEOUT_MS — pass to `.abortSignal(...)`. */
export function queryTimeout(): AbortSignal {
  return AbortSignal.timeout(QUERY_TIMEOUT_MS)
}

function assertEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export function createSupabaseServer() {
  return createClient<Database>(
    assertEnv('NEXT_PUBLIC_SUPABASE_URL'),
    assertEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
