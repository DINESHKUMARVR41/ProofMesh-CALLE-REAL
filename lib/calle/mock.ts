import type {
  CalleClient,
  CallTask,
  GetCallStatusResult,
  GetTranscriptResult,
  PlaceCallParams,
  PlaceCallResult,
} from './types';
import { buildCreateCallRequest, callTaskToStatus, callTaskToTranscript } from './map';
import { maskPhone } from './phone-mask';

const MOCK_CALL_ID = 'call_mock01JX0000000000';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A completed CALL-E call task, in the real wire shape — a committed_to_date
 * outcome with a five-turn transcript. Mock status/transcript are derived from
 * this via the same mappers the live client uses.
 */
function mockCallTask(callId: string): CallTask {
  const completed = new Date();
  const started = new Date(completed.getTime() - 127_000);
  const payDate = new Date(completed.getTime() + 4 * 86_400_000).toISOString().slice(0, 10);
  const structured = { outcome: 'committed_to_date', payment_date: payDate };
  const summary =
    'Client James committed to a bank transfer of SGD 4,800 by Friday. Outcome: committed_to_date.';
  return {
    id: callId,
    object: 'call_task',
    status: 'completed',
    task: 'Recover the overdue invoice from the client and collect a payment commitment.',
    recipients: [
      {
        id: 'rcp_mock01',
        phones: ['+6591234567'],
        locale: 'en-SG',
        region: 'SG',
        status: 'completed',
        structured_result: structured,
        summary,
        attempts: [
          {
            id: 'att_mock01',
            phone: '+6591234567',
            status: 'completed',
            started_at: started.toISOString(),
            completed_at: completed.toISOString(),
            summary,
            transcript_turns: [
              {
                offset_seconds: 2,
                speaker: 'bot',
                text: 'Hello, this is a call regarding invoice INV-2024-0042. Am I speaking with the accounts team?',
              },
              { offset_seconds: 6, speaker: 'user', text: 'Yes, this is James.' },
              {
                offset_seconds: 8,
                speaker: 'bot',
                text: 'I am calling regarding an outstanding invoice of SGD 4,800 that was due 30 days ago. Would you be able to confirm when payment can be made?',
              },
              {
                offset_seconds: 18,
                speaker: 'user',
                text: 'Apologies for the delay. I can arrange a bank transfer by Friday.',
              },
              {
                offset_seconds: 22,
                speaker: 'bot',
                text: 'Thank you, James. I will note that payment of SGD 4,800 is expected by Friday. We will send a confirmation email shortly. Have a good day.',
              },
            ],
            provider_call_id: 'provider_call_mock01',
            failure_code: null,
            failure_message: null,
          },
        ],
      },
    ],
    structured_result: structured,
    summary,
    task_completed: true,
    completion_confidence: { score: 0.9, label: 'high' },
    evidence: ['The client agreed to pay by Friday.'],
    metadata: {},
    failure_code: null,
    failure_message: null,
    created_at: started.toISOString(),
    completed_at: completed.toISOString(),
  };
}

export class MockCalleClient implements CalleClient {
  async placeCall(params: PlaceCallParams): Promise<PlaceCallResult> {
    await sleep(120);
    // Exercise the real request builder so the mock validates the same shape the
    // live client sends (task + recipient + result_schema).
    const request = buildCreateCallRequest(params);
    const result: PlaceCallResult = {
      callId: MOCK_CALL_ID,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    // Mask the recipient's phone(s) — a full destination number must never reach
    // the logs (ABUSE-REVIEW S1). Region/locale are fine to log.
    const recipient = request.recipients?.[0];
    console.log('[CALLE:mock] placeCall', {
      task: request.task.slice(0, 48),
      recipient: recipient && { ...recipient, phones: recipient.phones?.map(maskPhone) },
      callId: result.callId,
    });
    return result;
  }

  async getCallStatus(callId: string): Promise<GetCallStatusResult> {
    await sleep(80);
    const result = callTaskToStatus(mockCallTask(callId));
    console.log('[CALLE:mock] getCallStatus', {
      callId,
      status: result.status,
      outcome: result.outcome,
    });
    return result;
  }

  async getTranscript(callId: string): Promise<GetTranscriptResult> {
    await sleep(100);
    const result = callTaskToTranscript(mockCallTask(callId));
    console.log('[CALLE:mock] getTranscript', {
      callId,
      entryCount: result.entries.length,
    });
    return result;
  }
}
