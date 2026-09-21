# Metrics campaign — honest-numbers runbook

A runbook Minhaz executes **manually** to produce real, honest metrics for the
invoice-recovery skill: place a small set of **real** calls to **your own number**,
one per outcome branch, then read them back with `pnpm metrics`. Automation stays
`mock` — the only live calls are the ones you place by hand here.

> **This is a runbook, not code to execute.** Nothing in the repo places these calls
> for you. `CALLE_MODE=live` is set by you, for this manual campaign only, and set back
> to `mock` afterwards. The sweep, dialer, and crons stay `mock`.

---

## Results — campaign of Aug 5–7, 2026

Measured with `pnpm metrics` against the staging project after removing mock rows
and setup artifacts. These are the only numbers reported anywhere — in the demo
video, the PR, and the Devpost submission.

```
Calls placed        : 8
Completion rate     : 100.0% (8/8 reached a conversation)
Median call duration: 45s (n=8)
Conversational latency : insufficient data
Outcome breakdown   :
    paid_now            2
    committed_to_date   4
    disputed            1
    refused             1
    no_answer           0
    voicemail / wrong_person 0
    error               0
```

**Framing.** Eight real calls, all placed to the author's own phone, covering all
four conversation branches. This is a small sample and is reported as measured,
not projected. No figure here is extrapolated, rounded up, or estimated.

**What was proven live:**

- **ISO date resolution works end to end.** On a `committed_to_date` call the client
  said "the 20th of August" aloud; CALL-E returned `payment_date: 2026-08-20` — an
  absolute ISO date, not the spoken phrase. This is the acceptance check below,
  passed against the real API.
- **Outcome mapping is trigger-sensitive.** "I already paid yesterday" maps to
  `disputed` (a claim of prior payment), not `paid_now`. See the corrected trigger
  table below.

**What is not reported:** conversational latency. See `docs/LATENCY-DECISION.md`.
The payload type declares per-turn `offset_seconds`, but that type was reconstructed
from unreadable docs and never confirmed against a raw payload; even if present it is
a per-turn *start* offset at whole-second granularity, with no turn-end, so it cannot
isolate user-stops → agent-starts. Rather than publish a number that could not be
defended, the harness prints `insufficient data` and the demo video shows
responsiveness through real call audio instead.

---

## Preconditions (verify before you start)

- CALL-E credits provisioned; `CALLE_API_KEY` set; `CALLE_MODE=live` **only** for the
  manual campaign window. Set it back to `mock` when done.
- Point `.env` at the **LOCAL / staging** project you use for real-call testing — **not**
  the public demo project (whose seed uses reserved, non-routable fictional numbers).
- Call **your own number**, in a CALL-E-supported region (e.g. `+880…`, Bangladesh,
  English). Never call a third party to generate test data.
- Each call is placed through the normal `draft → approve → place → poll` path
  (`pnpm demo --to <your number> --region <CC>` with `--live`, or the invoice UI). You
  play the **client** and say the trigger lines below; the agent follows its script.
- **Network separation.** If the receiving phone shares a connection with the machine
  running the poll, an incoming call can knock that machine offline mid-poll and the
  run dies with `fetch failed`. Put the phone on an independent connection first.

---

## The four branches

Say the trigger line as the client. "Expected structured_result" is what CALL-E returns
via the `result_schema` (`lib/calle/map.ts`); "Mapped outcome" is what lands in
`calls.outcome` after `mapCalleOutcome` (`lib/calls/outcome-map.ts`).

| Branch | Say on the call (as the client) | Expected `structured_result` | Mapped outcome (`calls.outcome`) |
|---|---|---|---|
| **paid_now** | "I'll pay it today — the transfer will go out within the hour." (a **forward** commitment inside 24h) | `{ outcome: "paid_now", payment_date: "" }` | `paid` |
| **committed_to_date** | Give a **spoken / relative** date on purpose: "I can't pay today, but I'll settle it on **the 20th of August**." | `{ outcome: "committed_to_date", payment_date: "2026-08-20" }` — an **absolute ISO date**, resolved from the spoken phrase using the call date as reference | `committed` |
| **disputed** | "I already paid that one — the transfer went out yesterday." or "The amount is wrong, we agreed on less." | `{ outcome: "disputed", payment_date: "" }` (skill schema also captures `dispute_reason`) | `disputed` |
| **refused** | "No. I'm not paying, and I don't want to discuss it." (decline; no date, no dispute) | `{ outcome: "refused", payment_date: "" }` | `refused` |

> **Trigger lines matter — verified live.** A claim of *prior* payment ("I already
> paid yesterday") is treated as a dispute, because the agent cannot verify it and the
> invoice remains open. To reach `paid_now` you must commit to payment **going
> forward**, within 24 hours. Getting this wrong is the easiest way to end a campaign
> with a branch uncovered.

### payment_date acceptance check (the point of the committed_to_date call)

On the **committed_to_date** call, deliberately speak a **relative or partial** date
("the 20th of August", "next Friday"). Then confirm the returned `payment_date` is an
**absolute `YYYY-MM-DD`** (e.g. `2026-08-20`) — **not** the free-text phrase. The
`result_schema` already instructs this resolution; this call is how you verify CALL-E
honors it in practice. The app persists the ISO date onto the call row's
`transcript_ref` (`… · Payment date: 2026-08-20`).

**Status: passed**, Aug 7 2026. Spoken "the 20th of August" → `2026-08-20`.

---

## Poll window note (do not read an outcome too early)

CALL-E caps a call at **20 minutes**, and the terminal `completed_at` **lags the hangup
by ~28–30 s** of post-call processing (observed on the first live call: call ended
09:45:57, `completed_at` 09:46:25). The orchestrator polls at **2 s intervals up to
~22 minutes** (`MAX_POLL_ATTEMPTS = 660` in `lib/calls/orchestrate.ts`), which
comfortably exceeds a full-length call plus processing.

**The poll window must exceed the call length + the post-hangup processing lag.** A
result read before the task reaches a terminal status looks like a timeout / `no_answer`
even though the call succeeded — do not classify the outcome until the poll terminates.

---

## Reading the numbers afterwards

```bash
# Whole campaign by time window (calls started on/after your campaign start):
pnpm metrics --since 2026-08-05
# Or a labelled batch, if you tag calle_call_id with a common prefix:
pnpm metrics --tag CAMPAIGN_AUG
```

On Windows / PowerShell the plain `pnpm` scripts do **not** load `.env`. Load it into
the session first, then invoke through `npx tsx`:

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim() }
}
npx tsx scripts/metrics.ts
```

The report emits: **calls placed**, **completion rate** (reached a client conversation:
paid / committed / disputed / refused), **median call duration**, **median
conversational latency**, and a **per-branch outcome breakdown**.

### Table hygiene before reading

A campaign is only honest if the rows are. Before reporting, inspect every row and
remove **only**:

- rows whose `calle_call_id` begins with `call_mock` — mock runs are not calls;
- setup artifacts with a real call id but `null` duration and `null` outcome, created
  during environment fumbles where nothing ever rang.

Do **not** remove a row because it lowers a number. A call that rang and failed to
connect is a real result and stays counted. Delete by explicit ID, never by predicate,
and re-read the table afterwards to confirm the count.

### Honesty rules (non-negotiable)

- Any metric with no underlying rows prints **`insufficient data`** — never `0` dressed
  up as a measurement, never an estimate. A real small number beats an invented big one.
- **Median conversational latency reports `insufficient data`** on the DB until the
  recording path persists per-turn transcript timing. The `calls` table stores the
  mapped outcome, `duration_seconds`, and a transcript **summary** — not turn offsets.
  Do not report a latency figure you did not measure; capturing it (persisting turn
  offsets from `getTranscript`) is a documented follow-up, out of scope here.
- Report exactly what `pnpm metrics` prints. Do not fill blanks by hand.
- The number said aloud in any demo video must equal the number on screen and the
  number in every document. One source of truth.

---

## Safety

- `CALLE_MODE=live` for the **manual campaign only**; return it to `mock` immediately
  after. The sweep, dialer, and Vercel crons stay `mock`.
- Call **only your own number**. This runbook is for producing honest self-test metrics,
  not for placing real recovery calls to clients.
- Never run the sweep/dialer against the **public demo** in live mode — its seed uses
  reserved fictional numbers that are not routable and would burn credits on dead calls.
- Close `.env` before screen-recording. Credentials rendered on video are credentials
  published.