# PR: calle-invoice-recovery — Outbound Invoice Recovery Skill

## Summary

This PR adds `skills/calle-invoice-recovery/`, a reusable CALL-E skill for outbound
invoice-recovery calls. The skill phones a named client about a specific unpaid invoice,
conducts a structured multi-turn conversation, offers a payment arrangement when
appropriate, and records a typed outcome — behind a human approval gate at every
dispatch point.

---

## Contribution Area

**Agent Skills (`skills/`).**

Invoice recovery is a close sibling to the area's listed examples (order exception
follow-up, customer callbacks): it is a portable, host-agnostic call skill that other
agents can install and adapt, not a one-off app or a plugin tied to a specific no-code
platform. Community reusability was the deciding factor: a skill that drops into any
CALL-E-compatible host is more broadly useful than a Workflow Plugin bound to one
scheduler.

---

## What this contribution adds

### Skill folder: `skills/calle-invoice-recovery/`

| File | Purpose |
|------|---------|
| `SKILL.md` | Full conversation flow (five phases), outcome schema, prohibited behaviours, and safety contract summary. |
| `references/safety.md` | Authoritative reference for E.164 validation, PII masking, duplicate-call guards, jurisdiction warning, and credential hygiene. |
| `references/examples.md` | Fictional invoice dataset and four illustrative transcripts covering all four primary conversation branches (pay now, commit to date, dispute, cannot pay). |
| `references/adaptation-guide.md` | Step-by-step guide to deploying the skill in a different context: business name, invoice data source, tone, phone number validation, supported regions, environment setup, dry-run verification, and outcome handling. |
| `scripts/dry-run.ts` | Self-contained preview script — prints the full API payload and agent script that would be sent to CALL-E, makes no network request, consumes no credit, and guards against accidental live execution. |
| `README.md` | Community-facing README covering what the skill does, who it is for, quick start, adaptation seams, supported regions, limitations, and a clear "What this is NOT" section. |

### Conversation design highlights

- Five-phase flow: identity confirmation, invoice statement, pause, branch handling,
  closing. Every phase must complete before the call ends; every branch terminates in
  one of seven defined outcomes.
- Seven typed outcomes (`paid_now`, `committed_to_date`, `disputed`, `refused`,
  `no_answer`, `voicemail`, `wrong_person`) with explicit next-action notes for the
  operator at each outcome.
- Draft-then-approve at every dispatch point — no call is placed autonomously.
- Duplicate guard and per-outcome cooldown windows enforced before dispatch.
- Prohibited-behaviour table (no threats, no payment credentials over the phone, no
  discounts without operator approval, no impersonation of legal authority).

### Safety design highlights

- E.164 validation with a documented rationale (misrouted calls are a real, documented
  failure mode in outbound calling systems; `wrong_person` exists as a first-class
  outcome for this reason).
- PII masking rules with TypeScript implementation for phone numbers, client names, and
  email addresses — no personal data in logs or dry-run output.
- No hidden recurrence: the skill fires one call per authorized run and does not
  schedule its own follow-ups. A host may add recurrence — the reference app drafts calls
  on a schedule and dials them only after batch approval — but recurrence must stay
  visible and approval-gated, never hidden (documented in `references/safety.md`).
- Jurisdiction warning with region-specific notes (FDCPA for US, PDPA for Singapore,
  GDPR for EU, Privacy Act for Australia).

---

## CALL-E integration

CALL-E is load-bearing: without it, there is no call. The integration path:

- **Runtime call:** `POST /v1/calls` via the CALL-E REST API (or `@call-e/calle`
  TypeScript SDK, v0.2.0). Called at runtime on operator approval, not at import time.
- **result_schema:** Four-field typed schema (`outcome`, `commitment_date`,
  `dispute_reason`, `confidence`) extracted by CALL-E from the live call transcript.
- **Idempotency:** Each call dispatch carries an `Idempotency-Key` derived from the
  invoice reference and a timestamp, preventing duplicate charges on retry.
- **Dry-run path:** `scripts/dry-run.ts` exercises the full execution path (input
  parsing, script generation, payload assembly) without dispatching a call — safe for
  development and CI.

---

## How this was tested

### Structural validation

```bash
pnpm verify-skill
```

Passes all structural checks: required files present, SKILL.md frontmatter valid
(name, description, slug match, lowercase kebab-case), LF line endings, no CJK
characters, no leaked credentials.

### Dry-run execution

```bash
pnpm dry-run
pnpm dry-run --invoice-ref INV-2026-038
```

All five sample invoices produce correct output: masked PII, valid JSON payload shape,
correct result_schema, no network request, no credential required. The live-call guard
(`CALLE_MODE=live` check and `CALLE_API_KEY` presence check) both trigger correctly on
misconfiguration.

### Type checking and lint

```bash
pnpm typecheck && pnpm lint
```

No type errors; no lint warnings in the skill folder.

### Live calls — TODO

Live call testing against real CALL-E endpoints has not been completed at submission
time. Metrics from real calls will be added to `README.md` when available. See the
"What this is NOT" section below for what the current submission does and does not
claim.

---

## What this is NOT

- **Not a production debt-collection system.** This is a communication and
  record-keeping tool for chasing invoices in existing commercial relationships. It
  does not claim compliance with debt-collection licensing regimes (e.g. state-by-state
  US collection licenses, FCA in the UK). Before placing any call, the operator is
  solely responsible for confirming that outbound calls are lawful in the client's
  jurisdiction.
- **Not legal or financial advice.** The skill maintainers make no legal
  representations. Jurisdiction-specific disclosures required by law (e.g. the FDCPA
  statement for US calls) are documented in `references/safety.md §Jurisdiction
  Warning` but are not pre-loaded into the default script — the operator must add them.
- **Not autonomous.** Every call requires explicit human approval before dispatch. The
  skill itself fires one call per authorized run and schedules no recurrence. The
  reference host adds scheduled drafting + batch approval — calls are drafted
  automatically but dial only after a human approves them, and every queued call is
  visible and cancellable before it dials. Fully-autonomous dialing (drafting and placing
  with no approval step) is deliberately **not built**: debt collection is a regulated
  domain, the maintainers' safety expectation is no hidden recurrence, and the teardown of
  prior entries found approval-gated designs won. It is What's-next — gated behind an
  explicit opt-in and a spend cap, never a default.
- **Not a live-tested benchmark.** Performance metrics (call completion rate, outcome
  distribution, ASR accuracy, call duration) are marked TODO in `README.md`. No figures
  appear in this submission that were not measured from an actual run. The illustrative
  transcripts in `references/examples.md` are fictional and are labeled as such.
- **Not a small-agency SaaS.** The deliverable is a reusable skill, not a hosted
  product. There is no managed UI, no multi-tenant account system, and no payment
  processing. The reference implementation (Next.js / Supabase) demonstrates one
  possible host; the skill can be embedded in any host that can invoke the CALL-E API.

---

## Domain context

The conversation flow, outcome classification, and safety guardrails are derived from
real experience designing debt-resolution call flows for live agency clients (Devixus
Finance, Chittagong). The edge cases — misrouted calls, identity-in-doubt situations,
distressed or hostile clients, scope disputes, informal instalment offers — reflect
actual failure modes observed in outbound invoice-recovery calls, not hypothetical
scenarios. The sample dataset and transcripts are illustrative and fictional; they
do not contain any real client data.

---

## Checklist

- [x] Skill folder follows the `skills/<slug>/` structure defined in the repo README
- [x] `SKILL.md` has valid frontmatter (`name`, `description`, license)
- [x] `references/safety.md` and `references/examples.md` are present
- [x] All files use LF line endings
- [x] No real subscriber phone numbers in any file (fictional range `+1555010xxxx` used throughout)
- [x] No credentials or API keys committed
- [x] `pnpm verify-skill` passes
- [x] `pnpm typecheck && pnpm lint` passes
- [x] Dry-run script executes without error on all five sample invoices
- [x] "What this is NOT" section present in both `README.md` and this PR body
- [x] All performance metrics marked TODO — none invented
