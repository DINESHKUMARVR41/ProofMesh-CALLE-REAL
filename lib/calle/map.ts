// Translation between the app-facing client contract and the real CALL-E wire
// shape. Live and mock both go through here so the mock mirrors the real schema.
import type {
  CallTask,
  CreateCallRequest,
  GetCallStatusResult,
  GetTranscriptResult,
  PlaceCallParams,
  ResultSchema,
  TranscriptEntry,
} from './types';

/**
 * The structured result CALL-E extracts for every recovery call. `outcome` is a
 * string enum (feeds mapCalleOutcome); descriptions steer the extraction model.
 */
export const RECOVERY_RESULT_SCHEMA: ResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome'],
  properties: {
    outcome: {
      type: 'string',
      enum: [
        'paid_now',
        'committed_to_date',
        'disputed',
        'refused',
        'no_answer',
        'voicemail',
        'wrong_person',
      ],
      description:
        'The outcome of the recovery call. ' +
        'paid_now: client confirms payment already made or arriving within 24 hours. ' +
        'committed_to_date: client agreed to a specific payment date. ' +
        'disputed: client disputes the invoice amount or claims prior payment. ' +
        'refused: client declines to pay or engage, with no date or dispute. ' +
        'no_answer: the phone rang to completion and nobody answered. ' +
        'voicemail: reached voicemail. ' +
        'wrong_person: a third party answered and the named client was not reached.',
    },
    payment_date: {
      type: 'string',
      description:
        'The promised payment date as an ISO calendar date in YYYY-MM-DD format ' +
        '(for example 2026-08-20). Resolve relative or spoken dates such as ' +
        '"the 20th of August" or "next Friday" to an absolute YYYY-MM-DD, using ' +
        'the date of the call as the reference point. Return an empty string when ' +
        'the outcome is not committed_to_date or no date was given.',
    },
  },
};

/**
 * Normalize a payment_date to ISO YYYY-MM-DD when possible. If CALL-E ignores the
 * ISO instruction and returns free text ("the 20th of August"), the phrase is
 * preserved rather than dropped; empty/absent values become null.
 */
export function normalizePaymentDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; // already ISO
  const ms = Date.parse(raw); // best-effort parse of e.g. "20 August 2026"
  if (!Number.isNaN(ms)) {
    // Local components, not toISOString(), so a non-ISO phrase parsed as local
    // midnight isn't shifted a day by the runtime timezone.
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return raw; // unparseable free text — kept as-is, not discarded
}

/** BCP-47 locale from a language + region, e.g. ('en','BD') → 'en-BD'. */
export function toLocale(language: string, region: string): string {
  const lang = (language || 'en').toLowerCase();
  return region ? `${lang}-${region.toUpperCase()}` : lang;
}

/**
 * Build the real POST /v1/calls body. The agent script becomes the `task`; the
 * destination becomes a single recipient; the outcome is requested via
 * `result_schema`.
 */
export function buildCreateCallRequest(params: PlaceCallParams): CreateCallRequest {
  return {
    task: params.agentScript,
    recipients: [
      {
        phones: [params.toPhone],
        region: params.toRegion,
        locale: toLocale(params.language, params.toRegion),
      },
    ],
    result_schema: RECOVERY_RESULT_SCHEMA,
    metadata: params.metadata,
  };
}

/** The most recent attempt on the first recipient, or null. */
function latestAttempt(task: CallTask): CallTask['recipients'][number]['attempts'][number] | null {
  const attempts = task.recipients[0]?.attempts ?? [];
  return attempts.length > 0 ? attempts[attempts.length - 1] : null;
}

/** No-answer signal in an attempt status or failure code. */
const NO_ANSWER_RE = /no[\s_-]?answer|unanswered|no[\s_-]?response/i;

/**
 * When CALL-E returns no schema-valid result (structured_result is null), fall
 * back to the call/attempt status so a no-answer is recorded as such rather than
 * as a genuine failure: a canceled task, or an attempt whose status/failure_code
 * signals no answer, becomes 'no_answer'. Everything else stays null → 'error'.
 */
function outcomeFromStatus(task: CallTask): string | null {
  const attempt = latestAttempt(task);
  const signals = [attempt?.status ?? '', task.failure_code ?? '', attempt?.failure_code ?? ''];
  if (task.status === 'canceled' || signals.some((s) => NO_ANSWER_RE.test(s))) {
    return 'no_answer';
  }
  return null;
}

/**
 * Recovery outcome: the schema-extracted value when present, otherwise a
 * status-derived fallback so a no-answer is not misrecorded as an error.
 */
function outcomeFrom(task: CallTask): string | null {
  const extracted =
    task.structured_result?.outcome ?? task.recipients[0]?.structured_result?.outcome;
  if (typeof extracted === 'string') return extracted;
  return outcomeFromStatus(task);
}

/** Talk time in seconds, preferring the attempt window over the queue-inclusive task window. */
function durationSecondsFrom(task: CallTask): number | null {
  const attempt = latestAttempt(task);
  const span = (from: string | null, to: string | null): number | null =>
    from && to ? Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000)) : null;
  return span(attempt?.started_at ?? null, attempt?.completed_at ?? null) ?? span(task.created_at, task.completed_at);
}

export function callTaskToStatus(task: CallTask): GetCallStatusResult {
  const attempt = latestAttempt(task);
  const structured = task.structured_result ?? task.recipients[0]?.structured_result ?? null;
  return {
    callId: task.id,
    status: task.status,
    durationSeconds: durationSecondsFrom(task),
    outcome: outcomeFrom(task),
    paymentDate: normalizePaymentDate(structured?.payment_date),
    startedAt: attempt?.started_at ?? task.created_at,
    endedAt: attempt?.completed_at ?? task.completed_at,
  };
}

export function callTaskToTranscript(task: CallTask): GetTranscriptResult {
  const attempt = latestAttempt(task);
  const entries: TranscriptEntry[] = (attempt?.transcript_turns ?? []).map((turn) => ({
    role: turn.speaker === 'bot' ? 'agent' : 'human',
    text: turn.text,
    timestampSeconds: turn.offset_seconds,
  }));
  return {
    callId: task.id,
    entries,
    summary: attempt?.summary ?? task.summary,
  };
}
