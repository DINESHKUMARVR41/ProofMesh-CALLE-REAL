'use client'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Browser-side client — anon key only. Never passes service-role key.
export function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase public env vars')
  return createClient<Database>(url, key)
}
