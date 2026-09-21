/**
 * verify-staging — assert that live staging actually matches what the code claims.
 *
 * A task can create a migration file and regenerate types without ever applying
 * the migration to the database (the headless queue has no DB credentials). That
 * drift passes `pnpm typecheck` but breaks at runtime. This check closes that gap:
 * it derives the expected schema from `supabase/migrations/*.sql` and verifies,
 * against the LIVE staging database, that every expected table + column exists and
 * that RLS is enabled — so a task cannot claim schema it never applied.
 *
 * It also prints live row counts so row-write claims are visible/checkable.
 *
 * Usage:  pnpm verify-staging     (loads .env automatically)
 * Exits non-zero if staging is missing any expected table/column or RLS.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ---- load .env (self-contained; works standalone and inside the runner) -----
function loadEnv(): void {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\r$/, '')
  }
}
loadEnv()

// ---- derive expected schema from migration files ----------------------------
type Expected = { tables: Map<string, Set<string>>; rls: Set<string> }

function parseMigrations(dir: string): Expected {
  const tables = new Map<string, Set<string>>()
  const rls = new Set<string>()
  const skip = /^(constraint|primary|foreign|unique|check|exclude|like|--)/i

  const add = (t: string, c: string) => {
    if (!tables.has(t)) tables.set(t, new Set())
    tables.get(t)!.add(c)
  }

  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    : []

  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8')

    // create table public.<name> ( ... );
    for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi)) {
      const table = m[1]
      if (!tables.has(table)) tables.set(table, new Set())
      for (const rawLine of m[2].split('\n')) {
        const line = rawLine.trim()
        if (!line || skip.test(line)) continue
        const col = line.match(/^"?(\w+)"?\s+\w/)
        if (col) add(table, col[1])
      }
    }

    // alter table public.<name> ... add column <col> ...
    for (const stmt of sql.matchAll(/alter table (?:only )?public\.(\w+)([\s\S]*?);/gi)) {
      const table = stmt[1]
      for (const c of stmt[2].matchAll(/add column (?:if not exists )?(\w+)/gi)) {
        add(table, c[1])
      }
    }

    // enable row level security
    for (const m of sql.matchAll(/alter table public\.(\w+)\s+enable row level security/gi)) {
      rls.add(m[1])
    }
  }
  return { tables, rls }
}

// ---- run --------------------------------------------------------------------
async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('verify-staging: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
    process.exit(1)
  }

  const expected = parseMigrations(join(process.cwd(), 'supabase', 'migrations'))
  if (expected.tables.size === 0) {
    console.error('verify-staging: no tables parsed from supabase/migrations — nothing to verify.')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const failures: string[] = []
  const tableNames = [...expected.tables.keys()].sort()

  // Column existence: select all expected columns with limit 0. A missing column
  // makes PostgREST return an error naming it.
  for (const table of tableNames) {
    const cols = [...expected.tables.get(table)!]
    const { error } = await supabase.from(table).select(cols.join(','), { head: true }).limit(0)
    if (error) {
      failures.push(`table "${table}": ${error.message}`)
      console.error(`  MISSING/BAD  ${table}  — ${error.message}`)
    } else {
      console.log(`  OK           ${table}  — ${cols.length} expected columns present`)
    }
  }

  // RLS via the rls_status() helper from the initial migration.
  if (expected.rls.size > 0) {
    const { data, error } = await supabase.rpc('rls_status', { table_names: [...expected.rls] })
    if (error) {
      failures.push(`rls_status rpc failed: ${error.message}`)
      console.error(`  RLS CHECK    failed — ${error.message}`)
    } else {
      const rows = (data ?? []) as { tablename: string; rowsecurity: boolean }[]
      for (const t of [...expected.rls].sort()) {
        const row = rows.find((r) => r.tablename === t)
        if (!row || !row.rowsecurity) {
          failures.push(`RLS not enabled on "${t}"`)
          console.error(`  RLS OFF      ${t}`)
        } else {
          console.log(`  RLS ON       ${t}`)
        }
      }
    }
  }

  // Row counts — informational, so row-write claims are visible.
  console.log('\nLive row counts:')
  for (const table of tableNames) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    console.log(`  ${table.padEnd(14)} ${error ? '(count failed)' : count}`)
  }

  if (failures.length > 0) {
    console.error(`\nverify-staging FAILED — ${failures.length} problem(s). Staging does not match the migrations.`)
    process.exit(1)
  }
  console.log('\nverify-staging OK — live staging matches the migration files.')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
