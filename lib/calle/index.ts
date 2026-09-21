export type {
  CalleClient,
  CallStatus,
  GetCallStatusResult,
  GetTranscriptResult,
  PlaceCallParams,
  PlaceCallResult,
  TranscriptEntry,
} from './types';

export { CallEventLog } from './logger';
export type { CallEvent } from './logger';
export { LoggingCalleClient } from './logging-client';

import { LiveCalleClient } from './live';
import { MockCalleClient } from './mock';
import type { CalleClient } from './types';

export function getCalleClient(): CalleClient {
  const mode = process.env.CALLE_MODE ?? 'mock';
  if (mode === 'live') {
    const apiKey = process.env.CALLE_API_KEY;
    if (!apiKey) {
      throw new Error('CALLE_API_KEY is required when CALLE_MODE=live');
    }
    return new LiveCalleClient(apiKey);
  }
  return new MockCalleClient();
}
