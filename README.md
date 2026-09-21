# CALL-E Invoice Recovery Agent

A reusable Agent Skill for the `awesome-phone-call-agents` community that automates
overdue-invoice recovery calls — politely, in English, with a human approval gate
before every call is placed.

Submitted to the **CALL-E: Your Code Is Calling** hackathon (AIRUDDER Pte Ltd,
Singapore). Contribution Area: **Agent Skills** (`skills/`).

---

## The problem

Freelancers and small agencies chase overdue invoices by hand. The task is awkward to
do, easy to delay, and easy to botch — the wrong tone ends a client relationship. Most
operators handle the whole thing ad hoc: a hesitant email, maybe a phone call they keep
putting off, no consistent script, no written record.

There are software options, but they are aimed at large receivables teams. The small
operator needs a call placed tonight, not a workflow platform configured over a week.

## Who has it

A freelancer or small agency principal carrying a handful of overdue invoices from
overseas clients. The operator may be anywhere; the clients are in CALL-E-supported
regions and the calls go out in English.

The domain knowledge behind this skill comes from operating this workflow for real.
Devixus Finance tracks overdue invoices and partial payments across live agency
clients. Months of designing debt-resolution call flows — payment-arrangement logic,
guardrails, persona scoping, failure modes — give concrete fluency in where these calls
go wrong. That ground truth is not reproducible from a product specification.

---

## What it does

Given an overdue invoice, the skill:

1. **Generates a call script** — a structured English prompt tailored to the invoice
   amount, client name, and days overdue. Tone: professional, calm, firm but polite.
   Never aggressive.
2. **Presents the script to the operator for approval** before anything is sent to
   CALL-E. The operator can reject, edit, or approve. No call is placed without an
   explicit human sign-off.
3. **Places the call via CALL-E** and polls until a terminal status is reached
   (completed, failed, or timeout).
4. **Fetches the transcript** and maps the CALL-E outcome to a recovery state (see
   below).
5. **Records every event** — placement timestamp, API latency, duration, transcript
   reference, and outcome — against the invoice row in the database.
6. **Updates the invoice status** (`arranged` or `paid`) so the operator's dashboard
   reflects the current state immediately.

The whole sequence is a single atomic orchestration: draft → approve → call → record.
If any step fails, the error surfaces and the partial state is preserved for inspection.

Beyond the single-call flow, the app runs the same recovery on a schedule: a sweep
drafts calls for newly overdue invoices, the operator approves them as a batch on the
`/queue` review page, and approved calls dial themselves at their scheduled times — one
at a time, within calling hours for the client's region, and capped per destination.
This recurrence is always visible and approval-gated (see "What's next").

---

## How it works

### Conversation design

The call script has a fixed four-step flow:

1. **Open** — confirm you are speaking with the right contact at the client.
2. **Introduce** — state the invoice amount and days overdue. Ask when payment can be
   arranged.
3. **Listen and respond** — branches for a committed payment date, a request for more
   time, a disputed invoice, or no answer / voicemail.
4. **Close** — confirm next steps, offer a written follow-up, end professionally.

### Outcome states

CALL-E is instructed to report exactly one outcome code at the end of the call. Those
codes drive the database update and the operator's view. The mapping lives in
`lib/calls/outcome-map.ts`.

| CALL-E `structured_result.outcome` | Stored in `calls.outcome` | Meaning |
|---|---|---|
| `paid_now` | `paid` | Client confirms payment made or arriving within 24 hours |
| `committed_to_date` | `committed` | Client agreed a specific payment date; an absolute ISO date is captured |
| `disputed` | `disputed` | Client disputes the amount, or claims payment was already made |
| `refused` | `refused` | Client declines to pay or engage; no date and no dispute offered |
| `no_answer` | `no_answer` | Phone rang to completion; nobody answered |
| `voicemail` | `no_answer` | Reached voicemail; a brief professional message was left |
| `wrong_person` | `no_answer` | A third party answered; the named contact was not reached |

**A claim of prior payment maps to `disputed`, not `paid_now`.** The agent cannot
verify a payment it did not witness, and the invoice remains open until the operator
reconciles it. `paid_now` requires a forward commitment inside 24 hours. This
distinction was confirmed on a live call, not assumed.

### Approval gate

The operator sees the proposed call script and the proposed arrangement terms before
any credit is consumed. Approval or rejection is recorded in the database with a
timestamp. The state machine enforces the sequence: an arrangement can only move
`drafted → approved → executed`, never skip or reverse. A rejected arrangement stays in
`rejected` state — it is not deleted.

### CALL-E integration

Every interaction with the CALL-E API runs through a `LoggingCalleClient` wrapper that
records which method was called (`placeCall`, `getCallStatus`, `getTranscript`), the
CALL-E call ID, the wall-clock duration of the API call in milliseconds, and whether it
succeeded or returned an error. These events are written to stdout as structured JSON
lines and returned from the orchestration function for upstream use. Judges who ask
"how does it call CALL-E?" can read the logs — there are no invented figures.

### Stack

- **CALL-E** — `@call-e/calle` TypeScript SDK. `CALLE_MODE=live` places real calls;
  `CALLE_MODE=mock` runs a deterministic mock that exercises the full orchestration
  path without consuming credits.
- **Next.js (App Router)** — invoice list and detail pages, server actions for approval
  state transitions.
- **Supabase** — `invoices`, `calls`, `arrangements` tables. RLS on every table.
  Service-role key server-side only.
- **Vercel** — deployment target.
- **TypeScript** — strict, no `any`.

### Why CALL-E is load-bearing

Remove CALL-E and there is no product. The skill's entire value is that a voice
conversation happens with the client's contact, in real time, with a structured
outcome. No alternative path achieves that. The CALL-E SDK is imported at runtime; the
call is placed at runtime; the transcript and outcome come back from CALL-E at runtime.
This is not a wrapper around a generic HTTP client — the `placeCall` payload carries the
per-invoice agent script, the region code, and the structured outcome schema, and the
polling loop and transcript fetch are all CALL-E-specific operations.

---

## Metrics from real runs

Eight real calls placed to the author's own phone across Aug 5–7, 2026, covering all
four conversation branches. Read back with `pnpm metrics` from the `calls` table.
Full runbook: `docs/METRICS-CAMPAIGN.md`.

| Metric | Value |
|---|---|
| Calls placed | **8** |
| Call completion rate | **100.0%** (8/8 reached a conversation) |
| Median call duration | **45s** (n=8) |
| Outcome breakdown | paid_now 2 · committed_to_date 4 · disputed 1 · refused 1 |
| Median conversational latency | **not reported** — see below |
| Median CALL-E API latency (`placeCall`) | **not reported** — see below |
| Median CALL-E API latency (`getCallStatus`) | **not reported** — see below |
| Median CALL-E API latency (`getTranscript`) | **not reported** — see below |

**This is a small sample and is reported as measured, not projected.** Eight calls is
not a validation at scale, and nothing in this table is extrapolated.

**Why latency figures are absent.** *Conversational* latency — the user-stops →
agent-starts gap — cannot be derived from the data available. The payload type declares
per-turn `offset_seconds`, but that type was reconstructed from unreadable
documentation and never confirmed against a raw payload; even if present, it is a
per-turn *start* offset at whole-second granularity, with no turn-end, so the gap
cannot be isolated. *API* latency is captured per call by `LoggingCalleClient` and
visible in the structured logs, but it is not persisted to the database, so no median
across the campaign can be computed honestly. Rather than publish figures that could
not be defended, both report as absent. Persisting turn offsets and API timings is a
documented follow-up. Full reasoning: `docs/LATENCY-DECISION.md`.

**Proven live:** on a `committed_to_date` call the client said "the 20th of August"
aloud and CALL-E returned `payment_date: 2026-08-20` — an absolute ISO date resolved
from a spoken relative phrase, exactly as the `result_schema` instructs.

---

## Localisation and region

**Tested region:** Bangladesh (`+880`), English. CALL-E enabled `+880` as a recipient
region on 2026-07-28, English only — Bengali is not supported, and the skill does not
claim it. All eight campaign calls were placed to a Bangladeshi mobile number in
English.

The operator's own location (Chittagong) is irrelevant to the call path; what matters
is the client's region and the call language. The demo invoices are denominated in SGD
and USD against fictional overseas clients, which mirrors the real freelance case: a
Bangladesh-based operator invoicing clients abroad.

**ASR notes from transcript review.** Spoken dates were the only area needing
attention. A relative phrase ("the 20th of August") was resolved correctly to
`2026-08-20`, confirming the `result_schema` ISO instruction holds against live audio
rather than only in the mock. No accent-related mis-transcriptions changed an outcome
classification across the eight calls, though eight calls is far too small a sample to
claim general ASR robustness for the region.

**Region-specific phrasing.** One adjustment: the opening line states plainly that the
call is automated, before any invoice or payment is mentioned. This is the first spoken
sentence, near-verbatim, and is not deferred to later in the flow.

**Untested:** every other CALL-E region. No claim is made about behaviour outside
`+880`/English.

---

## What this is NOT

**Not a production collections system.** This is a hackathon skill built on an
eight-call sample. It is not validated at scale, does not handle edge cases across every
CALL-E-supported region, and has not been reviewed by a collections-law practitioner.
Do not use it for regulated debt collection without independent legal review.

**Not a research prototype.** The skill places real CALL-E calls in live mode, writes
real database rows, and shows a real operator dashboard. It is a working
implementation, not a proof-of-concept diagram. The sample size is small — see the
metrics table for the actual call count.

**Not a polished SaaS product.** No billing, no multi-tenant isolation, no self-serve
onboarding, no payment processing. The agent arranges; a human collects. The scope is
deliberately narrow: one operator, one invoice at a time, full human control at every
step.

**Not autonomous.** Every call requires explicit human approval before it is placed —
the scheduled path included. Recovery calls can be drafted automatically on a schedule
for newly overdue invoices, but they dial only after the operator approves them
(individually or as a batch), and any queued call is shown on its invoice and
cancellable before it dials. The agent never makes promises, never authorises a payment
arrangement, and never dials a call a human has not approved. Fully-autonomous dialing
is deliberately out of scope; see below.

---

## What's next

**Batch-approval recurrence is what ships.** A scheduled sweep drafts recovery calls
for invoices crossing overdue thresholds; the operator approves them in one review
moment; approved calls dial themselves at their scheduled times, one at a time, within
calling hours, bounded by a per-destination cap.

**Fully-autonomous dialing** — drafting and placing with no human approval step — is
explicitly deferred, not built. It is gated for three reasons: debt collection is a
regulated domain where an unapproved call can breach consumer-protection law; the
CALL-E skill maintainers' stated safety expectation is no hidden recurrence, so every
recurring call must be visible and approval-gated; and approval-gated designs have
consistently outperformed autonomous ones in prior teardowns. If it is ever built, it
will sit behind an explicit operator opt-in with a spend cap — never a default.

**Also queued:** persisting per-turn transcript offsets and API timings so
conversational and API latency become reportable rather than absent.

---

## Running it

```bash
# Install
pnpm install

# Development (mock CALL-E — no credits consumed)
CALLE_MODE=mock pnpm dev

# Type-check and lint
pnpm typecheck && pnpm lint

# Production build
pnpm build
```

Set `CALLE_MODE=live` and `CALLE_API_KEY=<your key>` to place real calls. See
`.env.example` for all required environment variables.

On Windows / PowerShell the `pnpm` scripts do not load `.env`; load it into the session
first, then invoke through `npx tsx`. See `docs/METRICS-CAMPAIGN.md`.

---

## Licence

MIT. Built for the CALL-E: Your Code Is Calling hackathon.