'use server'

// Server actions for the /queue batch-approval flow. The queue is drafted by the
// sweep and reviewed here; only a human 'approve' moves a draft toward dialing.
// Every mutation runs the pure state-machine guards first; the DB trigger
// (enforce_call_queue_transitions) is the data-layer backstop. Service-role
// bypasses RLS, so ownership is never caller-controlled — consistent with the
// existing arrangements actions (the app is single-user per SPEC).
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'
import {
  assertCanApprove,
  assertCanTransition,
  isCallQueueStatus,
} from '@/lib/queue/state-machine'

export interface ApproveResult {
  approved: string[]
  skipped: Array<{ id: string; reason: string }>
  batchId: string | null
}

/**
 * Approve a batch of drafted entries in one review moment. Each is guarded
 * individually (must be 'drafted' and unexpired); a stale or already-moved entry is
 * skipped with a reason rather than failing the whole batch. Approved entries share
 * one batch_id so the review is auditable as a unit.
 */
export async function approveQueueEntries(ids: string[]): Promise<ApproveResult> {
  if (ids.length === 0) return { approved: [], skipped: [], batchId: null }
  const supabase = createSupabaseServer()

  const { data, error } = await supabase
    .from('call_queue')
    .select('id, status, expires_at')
    .in('id', ids)
  if (error) throw new Error(`queue approve read failed: ${error.message}`)

  const now = new Date()
  const batchId = randomUUID()
  const approved: string[] = []
  const skipped: ApproveResult['skipped'] = []

  for (const row of data ?? []) {
    if (!isCallQueueStatus(row.status)) {
      skipped.push({ id: row.id, reason: `unrecognized status '${row.status}'` })
      continue
    }
    try {
      assertCanApprove({ id: row.id, status: row.status, expires_at: row.expires_at }, now)
    } catch (e) {
      skipped.push({ id: row.id, reason: e instanceof Error ? e.message : 'cannot approve' })
      continue
    }
    // Re-assert the transition and only update rows still 'drafted' (guards against a
    // concurrent change between read and write; the DB trigger is the final backstop).
    assertCanTransition('drafted', 'approved')
    const { data: updated, error: upErr } = await supabase
      .from('call_queue')
      .update({ status: 'approved', approved_at: now.toISOString(), batch_id: batchId })
      .eq('id', row.id)
      .eq('status', 'drafted')
      .select('id')
    if (upErr) {
      skipped.push({ id: row.id, reason: upErr.message })
      continue
    }
    if (!updated || updated.length === 0) {
      skipped.push({ id: row.id, reason: 'no longer drafted' })
      continue
    }
    approved.push(row.id)
  }

  revalidatePath('/queue')
  revalidatePath('/invoices')
  return { approved, skipped, batchId: approved.length > 0 ? batchId : null }
}

/** Drop a draft or an approved-but-not-yet-dialing entry. Terminal. */
export async function dropQueueEntry(id: string): Promise<void> {
  const supabase = createSupabaseServer()
  const { data, error } = await supabase
    .from('call_queue')
    .select('status')
    .eq('id', id)
    .single()
  if (error || !data) throw new Error(`queue entry ${id} not found`)
  if (!isCallQueueStatus(data.status)) throw new Error(`queue entry ${id}: unrecognized status`)

  assertCanTransition(data.status, 'dropped')
  const { error: upErr } = await supabase
    .from('call_queue')
    .update({ status: 'dropped' })
    .eq('id', id)
    .in('status', ['drafted', 'approved'])
  if (upErr) throw new Error(`queue drop failed: ${upErr.message}`)

  revalidatePath('/queue')
  revalidatePath('/invoices')
}

/** Edit a draft's script before approval. Only permitted while 'drafted'. */
export async function editQueueScript(id: string, script: string): Promise<void> {
  const trimmed = script.trim()
  if (!trimmed) throw new Error('Script cannot be empty.')
  const supabase = createSupabaseServer()
  const { data, error } = await supabase
    .from('call_queue')
    .select('status')
    .eq('id', id)
    .single()
  if (error || !data) throw new Error(`queue entry ${id} not found`)
  if (data.status !== 'drafted') throw new Error('Only a drafted call can be edited.')

  const { error: upErr } = await supabase
    .from('call_queue')
    .update({ script: trimmed })
    .eq('id', id)
    .eq('status', 'drafted')
  if (upErr) throw new Error(`queue edit failed: ${upErr.message}`)

  revalidatePath('/queue')
}
