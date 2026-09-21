/**
 * Unit test for the CALL-E mock client.
 * Run with: tsx lib/calle/calle.test.ts
 *
 * Drives MockCalleClient through place -> getCallStatus -> getTranscript
 * and asserts the shape of each response.
 * The live implementation (LiveCalleClient) is never invoked.
 */
import assert from 'node:assert/strict';

import { getCalleClient } from './index';
import { callTaskToStatus, normalizePaymentDate } from './map';
import { mapCalleOutcome } from '../calls/outcome-map';
import type {
  CallTask,
  CallTaskRecipient,
  GetCallStatusResult,
  GetTranscriptResult,
  PlaceCallResult,
} from './types';

const PLACE_PARAMS = {
  toPhone: '+6591234567',
  toRegion: 'SG',
  language: 'en',
  agentScript:
    'You are a polite invoice recovery agent. The client owes SGD 4800 for invoice INV-2024-0042, now 30 days overdue. Ask when they can pay and offer to arrange a date.',
  metadata: {
    invoiceId: 'inv-test-001',
    invoiceAmount: 4800,
    currency: 'SGD',
    clientName: 'James Tan',
    dueDays: 30,
  },
} as const;

async function run(): Promise<void> {
  // Always mock — CALLE_MODE is not set to 'live' in this queue
  const client = getCalleClient();

  // --- place ---
  const placed: PlaceCallResult = await client.placeCall(PLACE_PARAMS);

  assert.equal(typeof placed.callId, 'string', 'callId must be a string');
  assert.ok(placed.callId.length > 0, 'callId must be non-empty');
  assert.ok(
    ['queued', 'in_progress', 'completed', 'failed', 'canceled'].includes(
      placed.status,
    ),
    `status "${placed.status}" must be a valid CallStatus`,
  );
  assert.equal(
    typeof placed.createdAt,
    'string',
    'createdAt must be a string',
  );
  assert.ok(
    !isNaN(Date.parse(placed.createdAt)),
    'createdAt must be a valid ISO date',
  );

  // --- getCallStatus ---
  const status: GetCallStatusResult = await client.getCallStatus(placed.callId);

  assert.equal(status.callId, placed.callId, 'status.callId must match placed.callId');
  assert.ok(
    ['queued', 'in_progress', 'completed', 'failed', 'canceled'].includes(
      status.status,
    ),
    `status.status "${status.status}" must be a valid CallStatus`,
  );
  assert.ok(
    status.durationSeconds === null || typeof status.durationSeconds === 'number',
    'durationSeconds must be number | null',
  );
  assert.ok(
    status.outcome === null || typeof status.outcome === 'string',
    'outcome must be string | null',
  );
  assert.equal(typeof status.startedAt, 'string', 'startedAt must be a string');
  assert.ok(
    status.endedAt === null || typeof status.endedAt === 'string',
    'endedAt must be string | null',
  );

  // --- getTranscript ---
  const transcript: GetTranscriptResult = await client.getTranscript(
    placed.callId,
  );

  assert.equal(
    transcript.callId,
    placed.callId,
    'transcript.callId must match placed.callId',
  );
  assert.ok(
    Array.isArray(transcript.entries),
    'entries must be an array',
  );
  assert.ok(
    transcript.entries.length > 0,
    'entries must be non-empty',
  );
  for (const entry of transcript.entries) {
    assert.ok(
      entry.role === 'agent' || entry.role === 'human',
      `entry.role "${entry.role}" must be 'agent' or 'human'`,
    );
    assert.equal(typeof entry.text, 'string', 'entry.text must be a string');
    assert.ok(entry.text.length > 0, 'entry.text must be non-empty');
    assert.equal(
      typeof entry.timestampSeconds,
      'number',
      'entry.timestampSeconds must be a number',
    );
  }
  assert.ok(
    transcript.summary === null || typeof transcript.summary === 'string',
    'summary must be string | null',
  );

  console.log(
    '\n✓ place -> getCallStatus -> getTranscript: all shape assertions passed\n',
  );

  await testOutcomeFallback();
  testPaymentDate();
}

/**
 * payment_date normalizes to ISO when possible; free text is preserved rather
 * than dropped; empty/absent becomes null.
 */
function testPaymentDate(): void {
  assert.equal(normalizePaymentDate('2026-08-20'), '2026-08-20', 'ISO passes through');
  assert.equal(normalizePaymentDate('20 August 2026'), '2026-08-20', 'parseable text → ISO');
  // Unparseable free text is kept, not discarded or turned into an error.
  const freeText = normalizePaymentDate('the 20th of august');
  assert.ok(
    typeof freeText === 'string' && freeText.length > 0,
    'free text is preserved as a non-empty string',
  );
  assert.equal(normalizePaymentDate(''), null, 'empty string → null');
  assert.equal(normalizePaymentDate(undefined), null, 'absent → null');
  console.log('✓ payment_date: ISO normalized, free text preserved\n');
}

// A minimal CallTask in the real wire shape, with per-test overrides.
function makeTask(over: Partial<CallTask>): CallTask {
  return {
    id: 'call_test',
    object: 'call_task',
    status: 'completed',
    task: 'test task',
    recipients: [],
    structured_result: null,
    summary: null,
    task_completed: null,
    completion_confidence: null,
    evidence: [],
    metadata: {},
    failure_code: null,
    failure_message: null,
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    ...over,
  };
}

function recipientWithAttemptStatus(status: string): CallTaskRecipient {
  return {
    id: 'rcp_test',
    phones: ['+15550100000'],
    locale: 'en-US',
    region: 'US',
    status,
    structured_result: null,
    summary: null,
    attempts: [
      {
        id: 'att_test',
        phone: '+15550100000',
        status,
        started_at: null,
        completed_at: null,
        summary: null,
        transcript_turns: [],
        provider_call_id: null,
        failure_code: null,
        failure_message: null,
      },
    ],
  };
}

/**
 * When structured_result is null, a no-answer must be recorded as no_answer,
 * not error — error is reserved for genuine failures.
 */
async function testOutcomeFallback(): Promise<void> {
  // Extracted outcome passes straight through.
  const extracted = callTaskToStatus(makeTask({ structured_result: { outcome: 'paid_now' } }));
  assert.equal(extracted.outcome, 'paid_now', 'extracted outcome is used as-is');
  assert.equal(mapCalleOutcome(extracted.outcome), 'paid');

  // null + canceled task → no_answer.
  const canceled = callTaskToStatus(makeTask({ status: 'canceled', structured_result: null }));
  assert.equal(canceled.outcome, 'no_answer', 'canceled task maps to no_answer');
  assert.equal(mapCalleOutcome(canceled.outcome), 'no_answer');

  // null + attempt status signals no answer → no_answer.
  const noAnswer = callTaskToStatus(
    makeTask({
      status: 'completed',
      structured_result: null,
      recipients: [recipientWithAttemptStatus('no_answer')],
    }),
  );
  assert.equal(noAnswer.outcome, 'no_answer', 'no-answer attempt maps to no_answer');
  assert.equal(mapCalleOutcome(noAnswer.outcome), 'no_answer');

  // null + genuine failure → error (reserved).
  const failed = callTaskToStatus(
    makeTask({ status: 'failed', structured_result: null, failure_code: 'provider_error' }),
  );
  assert.equal(failed.outcome, null, 'genuine failure leaves outcome null');
  assert.equal(mapCalleOutcome(failed.outcome), 'error');

  console.log('✓ outcome fallback: no-answer distinguished from genuine error\n');
}

run().catch((err: unknown) => {
  console.error('FAIL', err);
  process.exitCode = 1;
});
