import type {
  CalleClient,
  GetCallStatusResult,
  GetTranscriptResult,
  PlaceCallParams,
  PlaceCallResult,
} from './types';
import type { CallEventLog } from './logger';

export class LoggingCalleClient implements CalleClient {
  constructor(
    private readonly inner: CalleClient,
    private readonly log: CallEventLog,
  ) {}

  async placeCall(params: PlaceCallParams): Promise<PlaceCallResult> {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    try {
      const result = await this.inner.placeCall(params);
      this.log.record({
        method: 'placeCall',
        invoiceId: params.metadata.invoiceId,
        calleCallId: result.callId,
        startedAt,
        durationMs: Date.now() - t0,
        success: true,
        error: null,
      });
      return result;
    } catch (err: unknown) {
      this.log.record({
        method: 'placeCall',
        invoiceId: params.metadata.invoiceId,
        calleCallId: null,
        startedAt,
        durationMs: Date.now() - t0,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async getCallStatus(callId: string): Promise<GetCallStatusResult> {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    try {
      const result = await this.inner.getCallStatus(callId);
      this.log.record({
        method: 'getCallStatus',
        invoiceId: null,
        calleCallId: callId,
        startedAt,
        durationMs: Date.now() - t0,
        success: true,
        error: null,
      });
      return result;
    } catch (err: unknown) {
      this.log.record({
        method: 'getCallStatus',
        invoiceId: null,
        calleCallId: callId,
        startedAt,
        durationMs: Date.now() - t0,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async getTranscript(callId: string): Promise<GetTranscriptResult> {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    try {
      const result = await this.inner.getTranscript(callId);
      this.log.record({
        method: 'getTranscript',
        invoiceId: null,
        calleCallId: callId,
        startedAt,
        durationMs: Date.now() - t0,
        success: true,
        error: null,
      });
      return result;
    } catch (err: unknown) {
      this.log.record({
        method: 'getTranscript',
        invoiceId: null,
        calleCallId: callId,
        startedAt,
        durationMs: Date.now() - t0,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
