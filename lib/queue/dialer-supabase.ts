// Supabase wiring for the dialer, shared by the cron route and `pnpm dial`.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type { CalleClient } from '../calle/types'
import type { ClaimedCall, DialerConfig, DialerDeps, DialerInvoice } from './dialer'

type DbClient = SupabaseClient<Database>

const INVOICE_COLUMNS =
  'id, user_id, client_name, amount, currency, due_date, language_preference, client_phone, client_region'

export function supabaseDialerDeps(
  supabase: DbClient,
  calle: CalleClient,
  now: Date,
  config: DialerConfig,
  allRegions: string[],
): DialerDeps {
  return {
    now,
    config,
    allRegions,
    calle,

    async claimNext(allowedRegions, atNow, destCap, staleMinutes) {
      const { data, error } = await supabase.rpc('claim_next_call', {
        p_allowed_regions: allowedRegions,
        p_now: atNow.toISOString(),
        p_dest_cap: destCap,
        p_stale_minutes: staleMinutes,
      })
      if (error) throw new Error(`claim_next_call failed: ${error.message}`)
      if (!data) return null
      const row = data as Database['public']['Tables']['call_queue']['Row']
      const claimed: ClaimedCall = {
        id: row.id,
        invoice_id: row.invoice_id,
        user_id: row.user_id,
        to_phone: row.to_phone,
        to_region: row.to_region,
        script: row.script,
        attempts: row.attempts,
      }
      return claimed
    },

    async loadInvoice(id) {
      const { data, error } = await supabase.from('invoices').select(INVOICE_COLUMNS).eq('id', id).single()
      if (error || !data) return null
      return data as DialerInvoice
    },

    async recordCompleted(rec) {
      const { data: callRow, error: callErr } = await supabase
        .from('calls')
        .insert({
          invoice_id: rec.invoiceId,
          user_id: rec.userId,
          started_at: now.toISOString(),
          calle_call_id: rec.calleCallId,
          outcome: rec.outcome,
          duration_seconds: rec.durationSeconds,
          transcript_ref: rec.transcriptRef,
        })
        .select('id')
        .single()
      if (callErr || !callRow) throw new Error(`dialer calls insert failed: ${callErr?.message ?? 'no data'}`)

      const { error: upErr } = await supabase
        .from('call_queue')
        .update({ status: 'completed', call_id: callRow.id })
        .eq('id', rec.entryId)
      if (upErr) throw new Error(`dialer queue complete failed: ${upErr.message}`)
    },

    async releaseForRetry(entryId) {
      const { error } = await supabase
        .from('call_queue')
        .update({ status: 'approved' })
        .eq('id', entryId)
        .eq('status', 'dialing')
      if (error) throw new Error(`dialer release failed: ${error.message}`)
    },
  }
}
