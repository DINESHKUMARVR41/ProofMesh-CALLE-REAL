import type {
  CalleClient,
  CallTask,
  GetCallStatusResult,
  GetTranscriptResult,
  PlaceCallParams,
  PlaceCallResult,
} from './types';
import { buildCreateCallRequest, callTaskToStatus, callTaskToTranscript } from './map';

const BASE_URL = 'https://api.heycall-e.com';

export class LiveCalleClient implements CalleClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `CALL-E ${method} ${path} failed: HTTP ${res.status} — ${text}`,
      );
    }
    // res.json() returns Promise<any> per the DOM lib; cast to T is intentional.
    return res.json() as Promise<T>;
  }

  async placeCall(params: PlaceCallParams): Promise<PlaceCallResult> {
    const start = Date.now();
    const idempotencyKey = `inv-${params.metadata.invoiceId}-${start}`;
    // Real wire shape: task-first, destination as a recipient, outcome via result_schema.
    const task = await this.request<CallTask>(
      'POST',
      '/v1/calls',
      buildCreateCallRequest(params),
      idempotencyKey,
    );
    const result: PlaceCallResult = {
      callId: task.id,
      status: task.status,
      createdAt: task.created_at,
    };
    console.log('[CALLE:live] placeCall', {
      callId: result.callId,
      status: result.status,
      durationMs: Date.now() - start,
    });
    return result;
  }

  async getCallStatus(callId: string): Promise<GetCallStatusResult> {
    const start = Date.now();
    const task = await this.request<CallTask>('GET', `/v1/calls/${callId}`);
    const result = callTaskToStatus(task);
    console.log('[CALLE:live] getCallStatus', {
      callId,
      status: result.status,
      outcome: result.outcome,
      durationMs: Date.now() - start,
    });
    return result;
  }

  async getTranscript(callId: string): Promise<GetTranscriptResult> {
    const start = Date.now();
    // No dedicated transcript endpoint — the turns live on the call task itself.
    const task = await this.request<CallTask>('GET', `/v1/calls/${callId}`);
    const result = callTaskToTranscript(task);
    console.log('[CALLE:live] getTranscript', {
      callId,
      entryCount: result.entries.length,
      durationMs: Date.now() - start,
    });
    return result;
  }
}
