// Supabase-backed wiring for the sweep. Kept separate from sweep.ts (pure logic)
// so the route handler and the `pnpm sweep` script share exactly one DB path, and
// the pure planner stays testable without a DB.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type { SweepConfig, SweepDeps, SweepInvoice } from './sweep'

type DbClient = SupabaseClient<Database>

const INVOICE_COLUMNS =
  'id, user_id, client_name, amount, currency, due_date, status, language_preference, client_phone, client_region'

export function supabaseSweepDeps(supabase: DbClient, now: Date, config: SweepConfig): SweepDeps {
  return {
    now,
    config,

    async expireStaleDrafts(atNow) {
      const { data, error } = await supabase
        .from('call_queue')
        .update({ status: 'expired' })
        .eq('status', 'drafted')
        .lte('expires_at', atNow.toISOString())
        .select('id')
      if (error) throw new Error(`sweep expireStaleDrafts failed: ${error.message}`)
      return (data ?? []).length
    },

    async listInvoices() {
      const { data, error } = await supabase.from('invoices').select(INVOICE_COLUMNS)
      if (error) throw new Error(`sweep listInvoices failed: ${error.message}`)
      return (data ?? []) as SweepInvoice[]
    },

    async loadFacts(invoiceIds, recentCallDays, atNow) {
      if (invoiceIds.length === 0) {
        return { openQueueInvoiceIds: new Set<string>(), recentCallInvoiceIds: new Set<string>() }
      }
      const sinceIso = new Date(atNow.getTime() - recentCallDays * 86_400_000).toISOString()
      const [openRes, recentRes] = await Promise.all([
        supabase
          .from('call_queue')
          .select('invoice_id')
          .in('status', ['drafted', 'approved', 'dialing'])
          .in('invoice_id', invoiceIds),
        supabase
          .from('calls')
          .select('invoice_id')
          .gte('started_at', sinceIso)
          .in('invoice_id', invoiceIds),
      ])
      if (openRes.error) throw new Error(`sweep openQueue read failed: ${openRes.error.message}`)
      if (recentRes.error) throw new Error(`sweep recentCalls read failed: ${recentRes.error.message}`)
      return {
        openQueueInvoiceIds: new Set((openRes.data ?? []).map((r) => r.invoice_id)),
        recentCallInvoiceIds: new Set((recentRes.data ?? []).map((r) => r.invoice_id)),
      }
    },

    async insertDraft(plan) {
      const { error } = await supabase.from('call_queue').insert({
        invoice_id: plan.invoice.id,
        user_id: plan.invoice.user_id,
        script: plan.script,
        to_phone: plan.toPhone,
        to_region: plan.toRegion,
        status: 'drafted',
        scheduled_for: plan.scheduledFor.toISOString(),
        expires_at: plan.expiresAt.toISOString(),
      })
      if (error) {
        // 23505 = unique_violation on call_queue_one_open_per_invoice: another sweep
        // (or a prior run) already has an open entry for this invoice. Not an error —
        // this IS the no-double-draft guarantee firing. Report it as a duplicate.
        if (error.code === '23505') return 'duplicate'
        throw new Error(`sweep insertDraft failed: ${error.message}`)
      }
      return 'inserted'
    },
  }
}
