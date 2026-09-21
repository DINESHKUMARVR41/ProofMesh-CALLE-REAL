export interface CallEvent {
  method: 'placeCall' | 'getCallStatus' | 'getTranscript';
  invoiceId: string | null;
  calleCallId: string | null;
  startedAt: string;
  durationMs: number;
  success: boolean;
  error: string | null;
}

export class CallEventLog {
  private readonly _entries: CallEvent[] = [];

  record(event: CallEvent): void {
    this._entries.push(event);
    console.log(
      '[CALLE:log]',
      JSON.stringify({
        method: event.method,
        calleCallId: event.calleCallId,
        durationMs: event.durationMs,
        success: event.success,
        ...(event.error !== null ? { error: event.error } : {}),
      }),
    );
  }

  get entries(): readonly CallEvent[] {
    return this._entries;
  }
}
