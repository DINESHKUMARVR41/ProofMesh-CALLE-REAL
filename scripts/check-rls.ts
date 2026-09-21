/**
 * Verify that RLS is enabled on all three core tables.
 *
 * Usage (from project root):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/check-rls.ts
 *
 * Or with a local .env file and Node 20+:
 *   node --env-file=.env --import tsx/esm scripts/check-rls.ts
 *
 * Requires the rls_status() function from the initial migration.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/types/database'

const TABLES = ['arrangements', 'calls', 'invoices'] as const

type RlsRow = { tablename: string; rowsecurity: boolean }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
    process.exit(1)
  }

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc('rls_status', {
    table_names: [...TABLES],
  })

  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }

  const rows = data as RlsRow[]
  let allEnabled = true

  for (const table of TABLES) {
    const row = rows.find((r) => r.tablename === table)
    if (!row) {
      console.error(`MISSING  ${table}  (table not found in pg_tables)`)
      allEnabled = false
    } else if (!row.rowsecurity) {
      console.error(`DISABLED ${table}  — RLS is OFF`)
      allEnabled = false
    } else {
      console.log(`OK       ${table}  — RLS enabled`)
    }
  }

  if (!allEnabled) {
    console.error('\nRLS check FAILED. Apply migrations and re-run.')
    process.exit(1)
  }

  console.log('\nAll tables have RLS enabled.')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
