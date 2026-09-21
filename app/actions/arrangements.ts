'use server'

import { createSupabaseServer } from '@/lib/supabase/server'
import {
  type ArrangementStatus,
  assertCanExecute,
  assertCanTransition,
  isArrangementStatus,
} from '@/lib/arrangements/state-machine'

// Fetch only the fields needed for state machine validation.
async function fetchForValidation(arrangementId: string): Promise<{
  id: string
  status: ArrangementStatus
  human_approved: boolean
}> {
  const supabase = createSupabaseServer()
  const { data, error } = await supabase
    .from('arrangements')
    .select('id, status, human_approved')
    .eq('id', arrangementId)
    .single()

  if (error || !data) {
    throw new Error(`Arrangement ${arrangementId} not found`)
  }

  const rawStatus: string = data.status
  if (!isArrangementStatus(rawStatus)) {
    throw new Error(
      `Arrangement ${arrangementId} has unrecognized status: ${rawStatus}`,
    )
  }

  return { id: data.id, status: rawStatus, human_approved: data.human_approved }
}

/**
 * Create a new arrangement draft. Status starts as 'drafted'; no approval yet.
 *
 * This runs on the service-role client (bypasses RLS), so ownership must NOT be
 * caller-controlled. `user_id` is derived from the target invoice — an arrangement
 * always belongs to the same owner as its invoice — so a client component cannot
 * use this action to write rows for an arbitrary user. (The app has no request
 * session to read; per SPEC it is single-user. Full per-caller authorization would
 * require the auth-session layer, which is out of scope.)
 */
export async function draftArrangement(invoiceId: string, proposedTerms: string) {
  const supabase = createSupabaseServer()

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('user_id')
    .eq('id', invoiceId)
    .single()

  if (invoiceError || !invoice) {
    throw new Error(`Invoice ${invoiceId} not found`)
  }

  const { data, error } = await supabase
    .from('arrangements')
    .insert({
      invoice_id: invoiceId,
      proposed_terms: proposedTerms,
      user_id: invoice.user_id,
      status: 'drafted',
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Failed to draft arrangement: ${error?.message ?? 'unknown error'}`)
  }
  return data
}

/**
 * Approve a drafted arrangement. Sets status='approved' and human_approved=true.
 * Only valid from 'drafted' status.
 */
export async function approveArrangement(arrangementId: string) {
  const current = await fetchForValidation(arrangementId)
  assertCanTransition(current.status, 'approved')

  const supabase = createSupabaseServer()
  const { data, error } = await supabase
    .from('arrangements')
    .update({
      status: 'approved',
      human_approved: true,
      approved_at: new Date().toISOString(),
    })
    .eq('id', arrangementId)
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Failed to approve arrangement: ${error?.message ?? 'unknown error'}`)
  }
  return data
}

/**
 * Reject an arrangement. Valid from 'drafted' or 'approved'.
 * Terminal state — cannot be transitioned out of.
 */
export async function rejectArrangement(arrangementId: string) {
  const current = await fetchForValidation(arrangementId)
  assertCanTransition(current.status, 'rejected')

  const supabase = createSupabaseServer()
  const { data, error } = await supabase
    .from('arrangements')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
    })
    .eq('id', arrangementId)
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Failed to reject arrangement: ${error?.message ?? 'unknown error'}`)
  }
  return data
}

/**
 * Execute an approved arrangement (e.g. trigger the CALL-E call).
 *
 * Safety gate: assertCanExecute() runs first and throws if the arrangement is not
 * in 'approved' status with human_approved=true. The DB trigger
 * (prevent_unapproved_execution) is a second line of defense.
 *
 * No path may execute an unapproved draft — enforced here AND at the data layer.
 */
export async function executeArrangement(arrangementId: string) {
  const current = await fetchForValidation(arrangementId)

  // Application-layer enforcement (first line of defense).
  assertCanExecute(current)
  assertCanTransition(current.status, 'executed')

  const supabase = createSupabaseServer()
  const { data, error } = await supabase
    .from('arrangements')
    .update({
      status: 'executed',
      executed_at: new Date().toISOString(),
    })
    .eq('id', arrangementId)
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Failed to execute arrangement: ${error?.message ?? 'unknown error'}`)
  }
  return data
}
