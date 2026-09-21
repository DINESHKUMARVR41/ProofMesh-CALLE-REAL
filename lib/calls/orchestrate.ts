import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { CallEventLog } from '../calle/logger';
import { LoggingCalleClient } from '../calle/logging-client';
import type { CalleClient } from '../calle/types';
import type { CallEvent } from '../calle/logger';
import { assertCanTransition } from '../arrangements/state-machine';
import { generateCallScript, generateProposedTerms } from './generate-script';
import { mapCalleOutcome } from './outcome-map';
import type { DbCallOutcome } from './outcome-map';
import { maskPhone } from '../calle/phone-mask';

type DbClient = SupabaseClient<Database>;
type InvoiceRow = Database['public']['Tables']['invoices']['Row'];

export interface OrchestrationParams {
  supabase: DbClient;
  calle: CalleClient;
  invoice: InvoiceRow;
  /** E.164 phone number for the recipient. */
  toPhone: string;
  /** CALL-E region code, e.g. 'SG'. */
  toRegion: string;
  /**
   * Called after the draft is written to DB with the generated agent script.
   * Return true to approve and place the call; false to reject and abort.
   */
  onApprove: (agentScript: string) => Promise<boolean>;
}

export interface OrchestrationResult {
  arrangementId: string;
  callRowId: string;
  calleCallId: string;
  outcome: DbCallOutcome;
  durationSeconds: number | null;
  transcriptSummary: string | null;
  /** Agreed payment date (ISO YYYY-MM-DD where available, else the raw phrase). */
  paymentDate: string | null;
  /** All CALL-E API events, for logging and submission metrics. */
  calleEvents: readonly CallEvent[];
}

// CALL-E caps a call at 20 minutes, and the terminal completed_at can lag the
// end of the call by ~30s of post-call processing (observed on the first live
// call: call ended 09:45:57, completed_at 09:46:25). Poll long enough to see the
// final status rather than giving up while the task is still finishing.
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 660; // 660 × 2s = 22 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Full end-to-end call orchestration:
 *   draft → approve → place call → poll → record outcome → update invoice
 *
 * Each step writes to the DB so callers can observe partial state at any time.
 * Raises on any failure; caller is responsible for surfacing the error.
 */
export async function orchestrateCall(
  params: OrchestrationParams,
): Promise<OrchestrationResult> {
  const { supabase, invoice, toPhone, toRegion, onApprove } = params;

  const eventLog = new CallEventLog();
  const calle = new LoggingCalleClient(params.calle, eventLog);

  const dueDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86_400_000),
  );

  const invoiceForScript = {
    clientName: invoice.client_name,
    amount: invoice.amount,
    currency: invoice.currency,
    dueDays,
  };

  const agentScript = generateCallScript(invoiceForScript, toRegion);
  const proposedTerms = generateProposedTerms(invoiceForScript, toRegion);

  // ── Step 1: Write draft arrangement ─────────────────────────────────────────
  const { data: arrangement, error: draftErr } = await supabase
    .from('arrangements')
    .insert({
      invoice_id: invoice.id,
      user_id: invoice.user_id,
      proposed_terms: proposedTerms,
      status: 'drafted',
      human_approved: false,
    })
    .select()
    .single();

  if (draftErr || !arrangement) {
    throw new Error(`Draft failed: ${draftErr?.message ?? 'no data returned'}`);
  }

  console.log(`[orchestrate] DRAFT  — arrangement ${arrangement.id}`);
  console.log(`[orchestrate]         ${proposedTerms}`);

  // ── Step 2: Human approval gate ─────────────────────────────────────────────
  const approved = await onApprove(agentScript);

  if (!approved) {
    await supabase
      .from('arrangements')
      .update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', arrangement.id);
    throw new Error('Call rejected by operator — arrangement marked rejected');
  }

  // State-machine guard (mirrors app/actions/arrangements.ts)
  assertCanTransition('drafted', 'approved');

  const { error: approveErr } = await supabase
    .from('arrangements')
    .update({
      status: 'approved',
      human_approved: true,
      approved_at: new Date().toISOString(),
    })
    .eq('id', arrangement.id);

  if (approveErr) {
    throw new Error(`Approve failed: ${approveErr.message}`);
  }

  // Mask the destination — a full number must never reach the logs (ABUSE-REVIEW S1).
  console.log(`[orchestrate] APPROVED — placing call to ${maskPhone(toPhone)} (${toRegion})`);

  // ── Step 3: Place the CALL-E call ────────────────────────────────────────────
  const placeResult = await calle.placeCall({
    toPhone,
    toRegion,
    language: invoice.language_preference ?? 'en',
    agentScript,
    metadata: {
      invoiceId: invoice.id,
      invoiceAmount: invoice.amount,
      currency: invoice.currency,
      clientName: invoice.client_name,
      dueDays,
    },
  });

  // ── Step 4: Insert call row (captures placement, not yet the outcome) ────────
  const { data: callRow, error: callInsertErr } = await supabase
    .from('calls')
    .insert({
      invoice_id: invoice.id,
      user_id: invoice.user_id,
      started_at: new Date().toISOString(),
      calle_call_id: placeResult.callId,
    })
    .select()
    .single();

  if (callInsertErr || !callRow) {
    throw new Error(`Call row insert failed: ${callInsertErr?.message ?? 'no data returned'}`);
  }

  console.log(`[orchestrate] PLACED  — call ${callRow.id} / calle: ${placeResult.callId}`);

  // ── Step 5: Poll until the call reaches a terminal status ────────────────────
  let currentStatus = placeResult.status;
  let statusResult = null;
  let attempts = 0;

  while (
    (currentStatus === 'queued' || currentStatus === 'in_progress') &&
    attempts < MAX_POLL_ATTEMPTS
  ) {
    await sleep(POLL_INTERVAL_MS);
    statusResult = await calle.getCallStatus(placeResult.callId);
    currentStatus = statusResult.status;
    attempts++;
    console.log(`[orchestrate] POLL ${attempts.toString().padStart(2, '0')}  — status: ${currentStatus}`);
  }

  if (!statusResult) {
    statusResult = await calle.getCallStatus(placeResult.callId);
  }

  if (attempts >= MAX_POLL_ATTEMPTS && currentStatus !== 'completed') {
    console.warn(`[orchestrate] Timed out polling after ${attempts} attempts — recording as error`);
  }

  // ── Step 6: Fetch transcript ──────────────────────────────────────────────────
  const transcriptResult = await calle.getTranscript(placeResult.callId);

  console.log(`[orchestrate] TRANSCRIPT — ${transcriptResult.entries.length} turns`);
  if (transcriptResult.summary) {
    console.log(`[orchestrate]   summary: ${transcriptResult.summary}`);
  }

  // ── Step 7: Record outcome on call row ───────────────────────────────────────
  const dbOutcome = mapCalleOutcome(statusResult.outcome);
  let transcriptRef = transcriptResult.summary ?? `calle:${placeResult.callId}`;
  // Capture the agreed payment date (ISO where CALL-E honoured the schema, else
  // the raw phrase) alongside the summary so it is persisted on the call row.
  if (dbOutcome === 'committed' && statusResult.paymentDate) {
    transcriptRef = `${transcriptRef} · Payment date: ${statusResult.paymentDate}`;
  }

  const { error: callUpdateErr } = await supabase
    .from('calls')
    .update({
      outcome: dbOutcome,
      duration_seconds: statusResult.durationSeconds,
      transcript_ref: transcriptRef,
    })
    .eq('id', callRow.id);

  if (callUpdateErr) {
    throw new Error(`Call outcome update failed: ${callUpdateErr.message}`);
  }

  console.log(
    `[orchestrate] OUTCOME — ${dbOutcome} (${statusResult.durationSeconds ?? '?'}s)`,
  );

  // ── Step 8: Update invoice status ────────────────────────────────────────────
  const invoiceStatus = dbOutcome === 'paid' ? 'paid' : 'arranged';

  const { error: invoiceUpdateErr } = await supabase
    .from('invoices')
    .update({ status: invoiceStatus })
    .eq('id', invoice.id);

  if (invoiceUpdateErr) {
    throw new Error(`Invoice status update failed: ${invoiceUpdateErr.message}`);
  }

  console.log(`[orchestrate] INVOICE — status updated to '${invoiceStatus}'`);

  // ── Step 9: Mark arrangement executed ────────────────────────────────────────
  assertCanTransition('approved', 'executed');

  const { error: execErr } = await supabase
    .from('arrangements')
    .update({
      status: 'executed',
      client_agreed: dbOutcome === 'paid' || dbOutcome === 'committed',
      executed_at: new Date().toISOString(),
    })
    .eq('id', arrangement.id);

  if (execErr) {
    throw new Error(`Arrangement execute failed: ${execErr.message}`);
  }

  console.log(`[orchestrate] EXECUTED — arrangement ${arrangement.id}`);

  return {
    arrangementId: arrangement.id,
    callRowId: callRow.id,
    calleCallId: placeResult.callId,
    outcome: dbOutcome,
    durationSeconds: statusResult.durationSeconds,
    transcriptSummary: transcriptResult.summary,
    paymentDate: statusResult.paymentDate,
    calleEvents: eventLog.entries,
  };
}
