# SPEC — CALL-E Invoice Recovery Agent

This file holds every decision the build needs.

---

## Status: gates cleared

1. **Region/language reality — Bangladesh IS supported (English); Bengali is NOT.**
   CALL-E's team confirmed in Discord (2026-07-28) that the route provider enabled
   **Bangladesh (+880) as a recipient region — English only.** **Bengali remains an
   unsupported spoken language**, so calls to +880 go out in English. Supported regions:
   US, SG, MY, IN [English/Hindi], AE, AU, CA, GB, VN, DE, JP, FR, MX, BR, ID, PH, KE,
   **and BD (Bangladesh, English)**. There is no Bengali voice path to build. The demo
   uses **Bangladesh (+880), English** (see "Demo region").
2. **Contribution Area chosen** — Agent Skills (`skills/`), see "Deliverable shape". **[RESOLVED]**

---

## The problem (decided)

Freelancers and small agencies chase overdue invoices by hand — awkward, easy to
delay, easy to do badly. The agent phones the client, holds a polite multi-turn
conversation about a specific unpaid invoice, offers a payment arrangement, and logs
the outcome. Every action is **draft-then-approve** — the human approves the call
script and any arrangement before it's acted on. No autonomous writes, no autonomous
promises. (This human-in-the-loop posture is what won across the Flood Sentinel
teardown; keep it.)

## Who has it (decided)

A **Chittagong-based freelancer** (or small agency) chasing **overdue invoices**. With
Bangladesh now a supported recipient region, the operator can call **local Bangladesh
clients directly (English, +880)** as well as clients abroad in other CALL-E-supported
regions. Calls go out in **English** (Bengali is unsupported). The edge is the operator's
real ground truth on how these chase conversations actually go.

## Demo region (decided)

Demo calls target **Bangladesh (+880), in English** — now a CALL-E-supported region
(English only). **Bengali is unsupported**, so no Bengali call is ever placed. (Fictional
example data elsewhere still uses documented reserved number ranges — NANP/UK/AU — because
+880 has no reserved fictional range; see the skill's `references/safety.md`.)

## Deliverable shape (RESOLVED — from the repo README)

Source: `github.com/CALLE-AI/awesome-phone-call-agents` README. It defines three
Contribution Areas: **Agent Skills** (`skills/`), **Workflow Plugins** (`plugins/`),
and **User-facing Apps** (`apps/`).

- Contribution Area: **Agent Skills (`skills/`).** It's the area for portable,
  reusable, host-agnostic phone-call skills (the repo's first stated principle is
  portability across agent hosts), and invoice recovery is the closest sibling to the
  area's own listed examples — "order exception follow-up" and "customer callbacks."
  A Workflow Plugin would bind us to one no-code platform (Dify/n8n/Zapier); a
  User-facing App would be a one-off demo rather than a reusable primitive. Both are
  weaker fits for something meant to be installed and adapted by other agents — and
  community reusability is a scored criterion.
- What the PR adds to the repo: a `calle-invoice-recovery/` skill folder following the
  repo's Skill template — `SKILL.md` (the recovery conversation flow in English,
  draft-then-approve gating, pay-now vs. commit-to-a-date outcome handling),
  `references/` (masked example invoices, E.164
  handling, consent/safety notes per the repo's Safety patterns), `scripts/` (a
  dry-run / preview path so the skill is safe to try without placing a real call), and
  `assets/`. Provider separation is respected: CALL-E places the call, the host
  scheduler handles any recurrence.
- Optional hosted demo? Only if it strengthens the ~3-min video. The deliverable is
  the PR (skill + README + demo video); a hosted app is not required for the skill to
  be reusable, and demo shine is the first thing to cut under time pressure.

## CALL-E integration (limits still partially BLOCKED — see access note)

- Access method: the **CALL-E server SDK** is the cleanest runtime path — server SDKs
  are published for **TypeScript** (`@call-e/calle`, v0.2.0) and **Python**
  (`calle-ai`, v0.2.0, imported as `calle`). Alternatives are the REST API
  (`https://api.heycall-e.com`, `POST /v1/calls`, Bearer `CALLE_API_KEY`,
  `Idempotency-Key`, strict `result_schema`) and MCP over Streamable HTTP. Confirm the
  final choice when wiring the real client. (Our stack is TypeScript, so
  `@call-e/calle` is the default assumption.)
- Must be called at runtime (rules requirement) — the call placement, the live
  transcript handling, and the outcome logging all go through CALL-E.
- **Supported SDK languages: TypeScript and Python.** Confirmed from the official
  `github.com/CALLE-AI/call-e-integrations` README ("Current server SDK packages"),
  which mirrors the docs SDKs page.

> **Access note.** The canonical source, `docs.heycall-e.com`, is a client-rendered
> single-page app that could **not** be read during research: the browser tool blocks
> the entire `heycall-e.com` domain ("Navigation to this domain is not allowed"), and a
> plain HTTP fetch returns only the page shell (title "CALL-E Developer Docs", no body);
> every guessed doc sub-path (`/quickstart`, `/sdks`, `/calls`, `/api-reference`,
> `/limits`) 404s to a bare fetch, and there is no `llms.txt` or `sitemap.xml`. So the
> values below are **not from the docs**: where a value is given it was confirmed
> out-of-band (attributed inline); the rest remain unverified.

- **Runtime limits** — duration & concurrency confirmed by **CALL-E's PM in Discord
  (2026-07-27)**; rate limits & credit metering still unverified (docs SPA unreadable):
    - Call duration cap: **20 minutes (max)** — CALL-E's PM, Discord (2026-07-27).
    - Concurrency limit: **1 on the default number; up to 10 with your own SIP trunk or a
      purchased number** — CALL-E's PM, Discord (2026-07-27).
    - Rate limits: **not documented** — listed as a governance feature, no concrete values
    - Credit metering: **not documented in the docs.** Marketing copy suggests per-call
      billing (a flat per-billable-call fee plus a free-call allowance), but figures were
      inconsistent across sources and are not the developer docs — verify before relying on them.
- Call budget: 20 free calls until the top-up request clears. Treat every call as
  expensive until then. (The "20 free calls" figure is corroborated by the
  `call-e-integrations` README.)

## Data model (draft — Supabase)

- `invoices` — client name, amount, currency, due date, status, language preference
- `calls` — invoice ref, timestamp, duration, CALL-E call id, outcome, transcript ref
- `arrangements` — invoice ref, proposed terms, human-approved bool, client-agreed bool
- RLS on every table. Service-role key server-side only.

## Auth model (decided)

Single-user for the hackathon (the operator). Supabase Auth, one account. No
multi-tenant complexity — out of scope.

## Out of scope (decided — protect the deadline)

- Multi-tenant / multi-agency accounts
- Payment processing (the agent arranges, humans collect — never touches money)
- Any autonomous action without human approval
- Non-English call flows (this rules out Bengali; Bangladesh itself is now a supported
  recipient region, English only), and any region/language CALL-E doesn't support
- A polished marketing site (the PR README + demo video are the deliverable)

## Real metrics to capture (from actual runs, for the submission)

Log these from real calls — never invent:
- ASR/transcription accuracy on a small fixed English test set (measured, stated as measured)
- Call completion rate on real dials
- Median call latency
- Number of calls actually placed
Write a "What this is NOT" section: research prototype, small sample, not a
production collections system.
