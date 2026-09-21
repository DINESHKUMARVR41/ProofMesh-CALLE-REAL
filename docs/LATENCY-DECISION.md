# Conversational-latency capturability — decision

**Question:** can the metrics harness ever report a real *conversational latency*
(agent response time), or should the line be dropped so nothing implies a measured
number? Investigation only — no instrumentation, no schema change, no real call.

**Verdict: UNCERTAIN.** The repo does not contain enough confirmed evidence to say
whether the real CALL-E payload carries usable per-turn timing. There is a *plausible*
field, but it is unconfirmed (reconstructed type + mock only), so it is neither safely
CAPTURABLE nor flatly NOT CAPTURABLE. One real payload inspection resolves it.

---

## Evidence (verbatim)

### 1. The real wire type *claims* per-turn timing — `lib/calle/types.ts`

Header of the file:

```ts
// Real CALL-E wire types — POST/GET /v1/calls (docs.heycall-e.com, OpenAPI 0.6.0).
```

The turn + attempt types:

```ts
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
```

So each turn *would* carry `offset_seconds` (a per-turn **start** offset), and each
attempt carries `started_at` / `completed_at`.

### 2. …but that type is reconstructed, not confirmed — `HANDOFF-STATE.md`

```
`docs.heycall-e.com` is a JS SPA the browser tool blocks, so these were in no readable doc;
CALL-E's PM ("YC") gave the values in Discord:
```

The API docs were **never machine-readable**. There is **no vendored OpenAPI/Swagger
spec file** in the repo (searched `**/*.{json,yaml,yml}` under `lib/` → none; the
"OpenAPI 0.6.0" string is only the comment above). So `TranscriptTurn.offset_seconds`
is a **hand-authored assumption**, not a field copied from a confirmed schema.

### 3. The mock emits `offset_seconds` — but mock is NOT evidence of the real API — `lib/calle/mock.ts`

```ts
transcript_turns: [
  { offset_seconds: 2,  speaker: 'bot',  text: 'Hello, this is a call regarding invoice INV-2024-0042. Am I speaking with the accounts team?' },
  { offset_seconds: 6,  speaker: 'user', text: 'Yes, this is James.' },
  { offset_seconds: 8,  speaker: 'bot',  text: '...' },
  { offset_seconds: 18, speaker: 'user', text: '...' },
  { offset_seconds: 22, speaker: 'bot',  text: '...' },
],
```

The mock invents whole-second offsets. This proves nothing about the real API — it is
the reference implementation's own fixture. (Flagged per the task: timing here is
mock-only; the real *type* claims it too, but unconfirmed.)

### 4. No real Aug-4 payload was stored, and the raw turns are discarded

- The real client fetches the raw task but logs only counts/latency, never the turns —
  `lib/calle/live.ts`:
  ```ts
  const task = await this.request<CallTask>('GET', `/v1/calls/${callId}`);
  const result = callTaskToTranscript(task);
  console.log('[CALLE:live] getTranscript', { callId, entryCount: result.entries.length, durationMs: Date.now() - start });
  ```
- The orchestrator logs only the turn **count** (`lib/calls/orchestrate.ts`:
  `` `[orchestrate] TRANSCRIPT — ${transcriptResult.entries.length} turns` ``).
- The recording path persists only the transcript **summary** into `calls.transcript_ref`
  (+ `duration_seconds`, mapped `outcome`). The per-turn `offset_seconds` are mapped to
  `entries[].timestampSeconds` and then **dropped** — never written to the DB.

There is **no stored real payload** anywhere in the repo to confirm the field exists in
practice or at what precision.

---

## Why this is UNCERTAIN, not CAPTURABLE or NOT CAPTURABLE

- Not **CAPTURABLE**: the only sources claiming per-turn timing are a reconstructed type
  and the mock. Neither confirms the real `GET /v1/calls/{id}` response actually returns
  `transcript_turns[].offset_seconds`. Committing to "capturable" would be building on an
  unverified assumption.
- Not **NOT CAPTURABLE**: there *is* a plausible, named timing field in the declared
  contract, so it would be wrong to say the payload carries no usable timing.
- **UNCERTAIN**: the repo cannot settle it. Also note a *second* caveat even if the field
  is real: `offset_seconds` is a per-turn **start** offset at whole-second granularity
  (in the mock). That yields inter-turn intervals (user-start → bot-start), which conflate
  the user's speaking time with the agent's response gap — a *clean* "gap between a user
  turn ending and the agent turn starting" needs turn-**end** (or per-turn duration)
  timestamps, which the declared type does not provide. So the resolving inspection must
  check both existence **and** shape/precision.

---

## Recommendation — one resolving step (do NOT place a call for it)

**Resolve during Minhaz's real-call campaign, not before.** On the first real call, log
the **raw** `GET /v1/calls/{id}` response once and inspect
`recipients[].attempts[].transcript_turns[]`:

1. Do the turns actually carry `offset_seconds` (or any `ts` / `start_ms` / `duration`)?
2. What is the granularity (whole seconds vs milliseconds)?
3. Is there any per-turn **end**/duration, or only a start offset?

This needs no extra call — it happens naturally when the campaign runs. Capture it with a
one-off raw log line (temporary), not a schema change.

**Until it is resolved:**
- The harness keeps printing **`insufficient data`** for median conversational latency.
  It is **never** reported as a number. (Already the behaviour — see `scripts/metrics.ts`
  and the honesty note in `docs/METRICS-CAMPAIGN.md`.)
- Do not instrument, add columns, or change the recording path on the strength of the
  reconstructed type alone.

**After the raw payload is inspected, exactly one of:**
- **Confirmed usable timing → future task (not now):** persist the turn offsets from
  `getTranscript` (e.g. a `conversational_latency_ms` on `calls`, or the turn array in a
  side table), have the harness compute the median inter-turn / response interval, and
  document precisely what it measures (including the start-offset caveat above).
- **No usable timing → drop the metric:** remove the "median conversational latency"
  line from `scripts/metrics.ts` and `docs/METRICS-CAMPAIGN.md` so nothing implies a
  measured number. The demo video can still *show* agent responsiveness through real call
  audio — no stat required.
