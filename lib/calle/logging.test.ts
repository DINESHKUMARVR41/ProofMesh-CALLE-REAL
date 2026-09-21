/**
 * Logging instrumentation test.
 * Run with: tsx lib/calle/logging.test.ts
 *
 * Drives LoggingCalleClient through 5 placeCall invocations (4 success + 1 failure)
 * and asserts: 5 rows written, all durationMs > 0, error captured on the failed row.
 */
import assert from 'node:assert/strict';

import { CallEventLog } from './logger';
import { LoggingCalleClient } from './logging-client';
import { MockCalleClient } from './mock';
import type {
  CalleClient,
  GetCallStatusResult,
  GetTranscriptResult,
  PlaceCallParams,
  PlaceCallResult,
} from './types';

const BASE_PARAMS: PlaceCallParams = {
  toPhone: '+6591234567',
  toRegion: 'SG',
  language: 'en',
  agentScript:
    'Recover invoice. The client owes SGD 4800, now 30 days overdue. Ask when they can pay.',
  metadata: {
    invoiceId: 'inv-test-001',
    invoiceAmount: 4800,
    currency: 'SGD',
    clientName: 'James Tan',
    dueDays: 30,
  },
};

class FailingCalleClient implements CalleClient {
  async placeCall(_params: PlaceCallParams): Promise<PlaceCallResult> {
    await new Promise<void>((resolve) => setTimeout(resolve, 55));
    throw new Error('CALLE_API_KEY invalid — simulated failure');
  }

  async getCallStatus(_callId: string): Promise<GetCallStatusResult> {
    throw new Error('not reachable');
  }

  async getTranscript(_callId: string): Promise<GetTranscriptResult> {
    throw new Error('not reachable');
  }
}

async function run(): Promise<void> {
  const log = new CallEventLog();
  const client = new LoggingCalleClient(new MockCalleClient(), log);
  const failing = new LoggingCalleClient(new FailingCalleClient(), log);

  // 4 successful placeCall invocations with distinct invoice IDs
  for (let i = 0; i < 4; i++) {
    await client.placeCall({
      ...BASE_PARAMS,
      metadata: { ...BASE_PARAMS.metadata, invoiceId: `inv-test-00${i + 1}` },
    });
  }

  // 1 failing placeCall — must be written to log, not silently dropped
  let errorCaught = false;
  try {
    await failing.placeCall(BASE_PARAMS);
  } catch (_e: unknown) {
    errorCaught = true;
  }
  assert.ok(errorCaught, 'failed placeCall must propagate the error to the caller');

  // ── assertions ──────────────────────────────────────────────────────────────

  assert.equal(log.entries.length, 5, 'must produce exactly 5 rows');

  for (const entry of log.entries) {
    assert.ok(
      entry.durationMs > 0,
      `every row must have durationMs > 0 (got ${entry.durationMs} for ${entry.method})`,
    );
  }

  const failed = log.entries.find((e) => !e.success);
  assert.ok(failed !== undefined, 'must have at least one failed row');
  assert.ok(
    typeof failed.error === 'string' && failed.error.length > 0,
    `failed row must carry the error message (got ${JSON.stringify(failed.error)})`,
  );

  const succeeded = log.entries.filter((e) => e.success);
  assert.equal(succeeded.length, 4, 'must have 4 successful rows');

  // ── summary ─────────────────────────────────────────────────────────────────

  console.log('\nCall event log rows:');
  for (const entry of log.entries) {
    console.log(
      `  [${entry.success ? 'OK ' : 'ERR'}] ${entry.method.padEnd(15)} durationMs=${String(entry.durationMs).padStart(4)} invoiceId=${entry.invoiceId ?? 'null'} error=${entry.error ?? 'null'}`,
    );
  }

  console.log(
    '\n✓ logging: 5 rows written, all durationMs > 0, failed call captured\n',
  );
}

run().catch((err: unknown) => {
  console.error('FAIL', err);
  process.exitCode = 1;
});
