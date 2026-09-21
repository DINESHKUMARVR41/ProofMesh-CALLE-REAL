// ─────────────────────────────────────────────────────────────────────────────
// Real CALL-E wire types — POST/GET /v1/calls (docs.heycall-e.com, OpenAPI 0.6.0).
// The create request is `task`-first: the instruction is the task, the destination
// is a recipient, and structured output is declared with a JSON Schema.
// ─────────────────────────────────────────────────────────────────────────────

/** Subset of JSON Schema that CALL-E's result extraction supports. */
export interface ResultSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface CallRecipientInput {
  phones: string[];
  region: string;
  /** BCP-47 locale, e.g. "en-US", "en-BD". */
  locale: string;
}

/** Body for POST /v1/calls. */
export interface CreateCallRequest {
  /** Natural-language instruction: the goal, context, and what to collect. */
  task: string;
  /** Explicit recipients. Omit when the phone target is embedded in `task`. */
  recipients?: CallRecipientInput[];
  /** JSON Schema for the whole-task structured result. */
  result_schema?: ResultSchema;
  /** JSON Schema for per-recipient results (batch calls). */
  recipient_result_schema?: ResultSchema;
  /** Caller-owned metadata echoed on the call and webhook payloads. */
  metadata?: Record<string, unknown>;
  /** Optional per-request HTTPS webhook. */
  webhook_url?: string;
}

/** Call-task lifecycle status (NOT the recovery outcome). */
export type CallStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'canceled';

export interface TranscriptTurn {
  offset_seconds: number;
  speaker: 'bot' | 'user';
  text: string;
}

export interface CallAttempt {
  id: string;
  phone: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  summary: string | null;
  transcript_turns: TranscriptTurn[];
  provider_call_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
}

export interface CallTaskRecipient {
  id: string;
  phones: string[];
  locale: string;
  region: string;
  status: string;
  structured_result: Record<string, unknown> | null;
  summary: string | null;
  attempts: CallAttempt[];
}

/** Response body for POST /v1/calls and GET /v1/calls/{id}. */
export interface CallTask {
  id: string;
  object: 'call_task';
  status: CallStatus;
  task: string;
  recipients: CallTaskRecipient[];
  /** Whole-task structured result extracted via result_schema; null if none. */
  structured_result: Record<string, unknown> | null;
  summary: string | null;
  task_completed: boolean | null;
  completion_confidence: { score: number; label: string } | null;
  evidence: string[];
  metadata: Record<string, unknown>;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// App-facing client contract — stable surface the orchestrator consumes. The
// live/mock clients translate to/from the wire types above.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlaceCallParams {
  toPhone: string;
  toRegion: string;
  language: string;
  agentScript: string;
  metadata: {
    invoiceId: string;
    invoiceAmount: number;
    currency: string;
    clientName: string;
    dueDays: number;
  };
}

export interface PlaceCallResult {
  callId: string;
  status: CallStatus;
  createdAt: string;
}

export interface GetCallStatusResult {
  callId: string;
  status: CallStatus;
  durationSeconds: number | null;
  /** Recovery outcome extracted via result_schema (structured_result.outcome). */
  outcome: string | null;
  /** Promised payment date, normalized to ISO YYYY-MM-DD when possible; else the
   *  raw phrase CALL-E returned, or null. */
  paymentDate: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface TranscriptEntry {
  role: 'agent' | 'human';
  text: string;
  timestampSeconds: number;
}

export interface GetTranscriptResult {
  callId: string;
  entries: TranscriptEntry[];
  summary: string | null;
}

export interface CalleClient {
  placeCall(params: PlaceCallParams): Promise<PlaceCallResult>;
  getCallStatus(callId: string): Promise<GetCallStatusResult>;
  getTranscript(callId: string): Promise<GetTranscriptResult>;
}
