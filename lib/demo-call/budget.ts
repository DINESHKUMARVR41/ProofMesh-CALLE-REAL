// Server-side budget + rate guard for the public judge call endpoint. The real
// enforcement lives in the demo DB (reserve_demo_call, advisory-locked); this
// layer reads DEMO_CALL_BUDGET, calls the reservation, and — critically —
// guarantees CALL-E is only reached when a reservation is granted.
import type { SupabaseClient } from '@supabase/supabase-js'

export type DenyReason = 'budget_exhausted' | 'ip_limit' | 'destination_limit' | 'rate_limited'

export interface ReserveResult {
  allowed: boolean
  reason?: DenyReason
  callId?: string
  remaining?: number
}

export interface BudgetSnapshot {
  total: number
  used: number
  remaining: number
}

/** Data-layer guard, injectable so the server action and tests share one path. */
export interface BudgetStore {
  reserve(ipHash: string, destinationMasked: string, region: string, budget: number): Promise<ReserveResult>
  finalize(id: string, status: string, calleCallId: string | null, outcome: string | null): Promise<void>
  snapshot(budget: number): Promise<BudgetSnapshot>
}

/** Total call budget (credit-pool cap). Env-overridable; sane default of 60. */
export function demoCallBudget(): number {
  const n = Number(process.env.DEMO_CALL_BUDGET ?? 60)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60
}

/** Human-readable message for a denial — plain, not obscure. */
export function denyMessage(reason: DenyReason): string {
  switch (reason) {
    case 'budget_exhausted':
      return 'The demo call budget for this deployment has been used up. No more calls can be placed.'
    case 'ip_limit':
      return 'You have reached the limit of 2 demo calls per day. Please try again tomorrow.'
    case 'destination_limit':
      return 'This number has already been called twice today. Please try a different number or again tomorrow.'
    case 'rate_limited':
      return 'A demo call was placed very recently. Please wait a couple of minutes and try again.'
  }
}

/**
 * Reserve a call slot, then run `place` ONLY if the reservation was granted.
 * If any cap denies, `place` (which is what touches CALL-E) is never invoked —
 * this is the guarantee that a denied call does not spend a credit.
 */
export async function runGuardedDemoCall<T>(
  store: BudgetStore,
  params: { ipHash: string; destinationMasked: string; region: string; budget: number },
  place: (reservationId: string) => Promise<T>,
): Promise<{ reservation: ReserveResult; placed: T | null }> {
  const reservation = await store.reserve(
    params.ipHash,
    params.destinationMasked,
    params.region,
    params.budget,
  )
  if (!reservation.allowed || !reservation.callId) {
    return { reservation, placed: null }
  }
  const placed = await place(reservation.callId)
  return { reservation, placed }
}

/** Supabase-backed store (service-role client against the demo project). */
export function supabaseBudgetStore(supabase: SupabaseClient): BudgetStore {
  return {
    async reserve(ipHash, destinationMasked, region, budget) {
      const { data, error } = await supabase.rpc('reserve_demo_call', {
        p_ip_hash: ipHash,
        p_destination_masked: destinationMasked,
        p_region: region,
        p_budget: budget,
      })
      if (error) throw new Error(`reserve_demo_call failed: ${error.message}`)
      const r = (data ?? {}) as ReserveResult
      return r
    },
    async finalize(id, status, calleCallId, outcome) {
      const { error } = await supabase.rpc('finalize_demo_call', {
        p_id: id,
        p_status: status,
        p_calle_call_id: calleCallId,
        p_outcome: outcome,
      })
      if (error) throw new Error(`finalize_demo_call failed: ${error.message}`)
    },
    async snapshot(budget) {
      const { data, error } = await supabase.rpc('demo_call_budget', { p_budget: budget })
      if (error) throw new Error(`demo_call_budget failed: ${error.message}`)
      return (data ?? { total: budget, used: 0, remaining: budget }) as BudgetSnapshot
    },
  }
}
