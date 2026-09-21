# HANDOFF-STATE

Full state for a fresh session. Written 2026-07-28; **updated 2026-08-05 (Phase E + F
shipped)**. Read the LATEST section first, then this, then `CLAUDE.md` and `SPEC.md`.

---

## LATEST — Phase E + Phase F shipped & merged to master (2026-08-05)

Everything below is **committed on `auto/build` and merged to `master`** (merge commit
`2d3a593`, pushed to `origin/master`). `CALLE_MODE=mock` throughout — no real call has
ever been placed. The one "live" dial test was a mock call (see F4).

### Phase E — public judge call flow + B1/S1 (commits `e783047`, `882f36e`)
- Capped, guarded, unauthenticated judge call flow (`/invoices/[id]` panel → server
  actions → `demo_calls` guard on the DEMO project → CALL-E). `ABUSE-REVIEW.md` reviews it.
- **B1 (Blocking, fixed):** per-destination cap — `reserve_demo_call` refuses a masked
  destination after **2 calls / 24h**, checked independently of the per-IP cap (closes
  the IP-rotation harassment path). Already applied + verified live on the DEMO project.
- **S1 (fixed):** full phone numbers no longer reach logs. `maskPhone` moved to
  `lib/calle/phone-mask.ts`; `mock.ts` + `orchestrate.ts` mask their log lines.
- Test: `lib/demo-call/destination-cap.test.ts` (3rd call to a masked dest refused,
  CALL-E never invoked on refusal).

### Phase F — scheduled drafting + batch approval + dialer (commits `b757b3b`, `28692b2`, `e051b3d`, `942a0dc`, `71389e4`)
- **F1 schema:** `call_queue` table (drafted→approved→dialing→completed; dropped/expired),
  RLS, partial unique index (one open entry per invoice), trigger
  `enforce_call_queue_transitions` (no dialing without approval; no approving an expired
  draft). App-layer state machine `lib/queue/state-machine.ts`. Added `invoices.client_phone`
  + `client_region` (the dialer's destination source).
- **F2 sweep:** `lib/queue/sweep.ts` drafts recovery calls for invoices past an overdue
  threshold **that have a valid phone**; expires stale drafts; idempotent; never drafts
  paid/disputed/arranged. Phone-less overdue invoices are surfaced, not dropped. Cron
  `/api/cron/sweep` + `pnpm sweep`.
- **F3 `/queue`:** batch-approval "morning review" — edit/drop/approve (individually or
  batch, one shared `batch_id`); "no phone on file" surface; Scheduled + History sections.
- **F4 dialer:** `claim_next_call` (advisory-locked; **concurrency = 1**; **per-destination
  cap 2/24h**; **calling hours** 10–18 local; **stale-lease reclaim** 25min). Re-validates
  the CURRENT destination (edited-to-unsupported won't dial); retry once then error; links
  a calls row. Cron `/api/cron/dial` (*/15) + `pnpm dial`.
- **F5 visibility:** invoice detail shows scheduled calls + **cancel**; `/invoices` marks
  "Call scheduled" + links "Review queue →"; framing copy; skill `SKILL.md`/`safety.md`
  document batch-approval recurrence as the intended (visible, approval-gated) mode.
- **F6 scope + review:** README/PR-BODY — batch-approval ships; fully-autonomous dialing
  is What's-next, **gated** (regulated domain, no-hidden-recurrence, teardown finding).
  `QUEUE-REVIEW.md` (abuse review, severity-tagged).

### DB migrations (in `supabase/migrations/`, applied to BOTH staging + demo via MCP; types regenerated from demo)
- `20260804140000_call_queue.sql` (+ live alter `20260804140001` added `to_phone`/`to_region`)
- `20260804150000_invoice_client_contact.sql`
- `20260804160000_call_queue_dialer.sql`
- Demo-only (unchanged, in `migrations-demo/`): `20260804000000_demo_calls.sql` (has the B1 cap).

### Verification (all green on `auto/build` before merge)
`pnpm typecheck`, `lint`, `test` (24 checks), `build`, `verify-staging`, `verify-skill`.
Live proofs against staging (all with cleanup): B1 cap, call_queue trigger, no-double-draft
index, a real `pnpm dial` mock call, dialer concurrency=1, dialer per-destination cap. F3 +
F5 UIs driven end-to-end in the browser. **Staging left at baseline** (2 invoices — Test
Client [no phone; operator adds their own number], Meridian [arranged]; 0 `call_queue`; 2 calls).

### Vercel / env for deploy (operator action)
- **Judge flow:** `DEMO_CALL_BUDGET` (default 60), `DEMO_IP_SALT` (set a real random salt).
- **Crons:** `CRON_SECRET` **required** — the cron routes fail closed without it, and Vercel
  Cron sends it as `Authorization: Bearer`. Optional tuning: `QUEUE_OVERDUE_THRESHOLDS`
  (`7,14,30`), `QUEUE_RECENT_CALL_DAYS` (7), `QUEUE_DRAFT_TTL_HOURS` (48),
  `QUEUE_CALL_START_HOUR` (10), `QUEUE_CALL_END_HOUR` (18), `QUEUE_DEST_CAP` (2),
  `QUEUE_DIAL_STALE_MINUTES` (25).
- **`vercel.json` crons:** sweep `0 8 * * *`, dial `*/15 * * * *`. The sub-daily dial cadence
  needs **Vercel Pro** (Hobby allows daily crons only).

### `CALLE_MODE=live` gate (do NOT flip until)
- B1 ✓, S1 ✓. Before live: decide **QUEUE-REVIEW S1** (the dialer path has no total/daily
  spend cap yet), set `CRON_SECRET` + `DEMO_IP_SALT` + `DEMO_CALL_BUDGET`.
- **The public DEMO deployment seeds RESERVED fictional numbers (not routable).** Do NOT
  enable the sweep/dial crons against the demo in live mode — they would spend credits on
  doomed calls. On the demo, the live-capable path is the **judge flow** (judge enters their
  own number). The autonomous dialer/live combo is for a real deployment with real client
  numbers only.

---

## 0. Orientation (read this or you'll be confused)

- **Two working copies, one repo.**
  - `G:\calle-invoice-agent` — main clone, branch **`master`**. **Docs only** — it does NOT
    contain the app yet.
  - `G:\calle-invoice-agent-auto` — git **worktree**, branch **`auto/build`**. **This is where
    the app and everything real lives.** Do all work here.
- **GitHub:** `github.com/minhaz1221/calle-invoice-agent` (private). **PR #1**
  (`auto/build → master`) is **open and MERGEABLE**. `master` only gets the app once #1 merges.
- Current tips at handoff: `auto/build` = `2dbceb7`, `master` = `0516339`.
- **Merging PR #1 is the single highest-leverage unblock** — it makes `master` deployable and
  **stops the recurring CLAUDE.md merge conflict** (see §8).
- Everything runs **`CALLE_MODE=mock`** — no real calls have ever been placed.

---

## 1. What's built and verified

The full reference app + a submittable Agent Skill, built through an unattended runner in phases:

- **Phase B — the app** (Next.js 15 App Router / TypeScript strict / Tailwind / Supabase):
  scaffold + brand tokens, Supabase schema with owner-scoped RLS + a `prevent_unapproved_execution`
  trigger, a `CalleClient` interface with `mock` + `live` impls (`CALLE_MODE`), call logging,
  invoice list/detail pages, draft→approve state machine, end-to-end orchestration, metrics harness,
  README. Self-review in `REVIEW.md`.
- **Phase C — the skill**: `skills/calle-invoice-recovery/` — an Agent Skill for a PR to
  `github.com/CALLE-AI/awesome-phone-call-agents`. Passes the **real** repo validator (see §7).
  `PR-BODY.md` (repo root) drafts the submission.
- **Phase D — demo/real split**: `supabase/seed/demo.sql`, `scripts/seed-demo.ts` (`pnpm seed-demo`,
  `--yes` guard), two-env docs in `DEPLOY.md`, a CLAUDE.md landmine, a UI notice, `SPLIT-REVIEW.md`.
- **Deploy prep**: `DEPLOY.md`, and `force-dynamic` on both invoice pages so `next build` is
  env-independent (verified: builds with no `.env`).

**Verification that currently passes** (run in `auto/build`, `set -a; . ./.env; set +a` first):
`pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm verify-staging`, `pnpm verify-skill`, `pnpm test`.
The end-to-end demo (`pnpm demo`) has been run against staging (mock CALL-E) and wrote real rows.

---

## 2. Supabase / environments

- **MCP org must be "Devixus"** (`obyndratipaiwyjebczd`). Earlier a *different* account
  ("AlejandroAscencio") was connected — do NOT create anything there.
- **LOCAL / staging project**: `calle-invoice-agent-staging`, ref **`sjobbksiksixqpfvliyf`**,
  region `ap-south-1`, free tier ($0/mo). Currently ~**1 invoice / 1 call / 1 arrangement**
  (from a demo run). Used for real-call testing; **never deployed**.
- **DEMO project — CREATED (2026-07-31)**: `calle-invoice-agent-demo`, ref **`uxhapbzkoubzeqjdtipn`**,
  region `ap-south-1`, free tier ($0/mo — `get_cost` returned $0; org still under the Free-plan
  2-active-project cap since `devixus-widgets` is paused). **All 3 migrations applied via the Supabase
  MCP**; the 3 tables exist with RLS enabled, 0 rows, security advisor clean. **Not yet seeded** — needs
  ≥1 `auth.users` row first (see §11 step 5). This is the project Vercel points at for the public demo.
- **Migrations**: **3 files** in `supabase/migrations/` — `initial_schema`, `arrangement_status`,
  `add_disputed_outcome`. NOTE: the `widen_language_preference` change is folded **inline** into
  `initial_schema.sql` (not a separate file); the DB's MCP migration *history* shows 4 named entries,
  but applying the **3 files** to a fresh project produces the correct final schema.
- **Migrations are applied out-of-band via the Supabase MCP.** The headless sub-agents have no DB
  creds and must NOT run `supabase db push`/`link` (landmine in CLAUDE.md).

### The two-environment split (Phase D) — why it exists
The deployed app has **no authentication** and reads via the **service-role client** (bypasses RLS),
so **every row in the deployed database is publicly readable by anyone with the URL**. Therefore:
- **DEMO project** (`calle-invoice-agent-demo`, ref `uxhapbzkoubzeqjdtipn` — created 2026-07-31, schema
  applied) — holds ONLY the fictional `demo.sql` seed; this is what Vercel points at and what judges exercise.
- **LOCAL project** — the existing staging project, for real-call testing; never deployed.
Real client data must **never** be written to the demo project. `pnpm seed-demo --yes` is destructive
(truncates the 3 tables) and is for the demo project only. **`seed-demo` was NOT run against staging**
during Phase D (the sub-agent respected the guardrail) — staging is untouched.

---

## 3. CALL-E facts

- **Supported recipient regions/languages** (from `github.com/CALLE-AI/call-e-integrations`):
  US, SG, MY, IN (en/hi), AE (en/ar), AU, CA, GB, VN, DE (en/de), JP, FR, MX, BR, ID, PH, KE,
  **and BD (Bangladesh, English)**. UPDATE (2026-07-28): CALL-E's team confirmed in Discord that
  **Bangladesh (+880) is now supported — English only.** **Bengali is still NOT supported.** The
  product is English-only; **demo region = Bangladesh (+880)** (reverted from SG).
- **SDKs**: TypeScript `@call-e/calle`, Python `calle-ai`. **API**: `https://api.heycall-e.com`,
  `POST /v1/calls`, Bearer `CALLE_API_KEY`, strict `result_schema`, `/calle/webhook`.
- **Free calls**: 20 (per the integrations repo; a marketing snippet said "200 free / $0.05 per call" —
  inconsistent, unverified).

### CALL-E limits — confirmed by CALL-E's PM in Discord (2026-07-27)
`docs.heycall-e.com` is a JS SPA the browser tool blocks, so these were in no readable doc;
CALL-E's PM ("YC") gave the values in Discord:
- **Max call duration: 20 minutes.**
- **Concurrency: 1 on the default number; up to 10 with your own SIP trunk or a purchased number.**
- (Rate limits and exact credit metering still unconfirmed.)
**DONE (2026-07-28):** folded into `SPEC.md` §"CALL-E integration" and the skill's
`docs/guide.md` "Limitations" (both previously said "not documented").

---

## 4. Open real-world blockers (human/external — NOT code)

- **CALL-E credits — UPDATE (2026-07-28):** the operator submitted the credit request form and
  **200 additional calls were granted, re-requestable after 80% use.** (Earlier there was a $0.00
  balance question; credits are now provisioned.) Credit-form / account / ToS actions remain the
  **operator's** — do NOT do them yourself (see §9).
- **Deadline — CONFIRMED (2026-07-28):** **Sep 14, 2026, 12:00pm SGT** (from the official credits
  request form) = 10:00am Bangladesh time Sep 14. No longer ambiguous.
- **Bangladesh routing — RESOLVED (2026-07-28):** the route provider enabled **Bangladesh (+880),
  English**; it is now a supported recipient region. Bengali is still NOT supported (English only).
- **Skill PR not submitted** — the `awesome-phone-call-agents` PR is a future manual step (run the real
  validator with Python first, use `PR-BODY.md`).

---

## 5. Deploy (Vercel) — status

`DEPLOY.md` is authoritative. Key points:
- Deploy **`auto/build`** (master is docs-only until PR #1 merges).
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (both build+runtime, inlined),
  `SUPABASE_SERVICE_ROLE_KEY` (server-only secret), `CALLE_MODE=mock`. `CALLE_API_KEY` only if live (omit).
- Build is env-independent (force-dynamic). Free-tier Supabase **auto-pauses when idle** — wake it before demos.
- **Not deployed yet** — the operator does the deploy. For the public demo, point Vercel at a **separate
  demo project** seeded via `pnpm seed-demo --yes` (needs ≥1 `auth.users` row first).

---

## 6. The unattended runner (how to run a queue)

- `run-queue.mjs` runs a task file headlessly (one `claude -p` sub-agent per task, fresh context, halts
  on first failure). Flags: `--tasks <file>` (default `tasks.json`), `--from N`, `--to N` (stop after N,
  inclusive), `--skip-doc-check`, `--dry-run`.
- Task files: `tasks.json` (Phase B, done), `tasks-skill.json` (Phase C, done),
  `tasks-demo-split.json` (Phase D, done). Verify array runs after every task:
  `typecheck, lint, build, verify-staging, verify-skill`.
- **Pre-flight doc check**: halts if `CLAUDE.md` / `SPEC.md` / the active tasks file differ between
  `master` and the worktree (files not on master are skipped). Normalizes CRLF/LF before comparing.
- **Headless auth — REQUIRED, easy to miss:** the runner needs `CLAUDE_CODE_OAUTH_TOKEN`. It is a
  **permanent User env var**, but a session's shell predates it, so **inject it from the registry**:
  ```bash
  export CLAUDE_CODE_OAUTH_TOKEN="$(powershell.exe -NoProfile -Command "[Environment]::GetEnvironmentVariable('CLAUDE_CODE_OAUTH_TOKEN','User')" | tr -d '\r')"
  node run-queue.mjs --tasks <file> --from 1 > .claude-runs/<name>.out 2>&1   # run in background + Monitor the .out
  ```
- The runner spawns sub-agents with `--dangerously-skip-permissions` and a 20-min per-task timeout.
  Sub-agents run ~5–20 min each; a full 5-task queue can exceed a 60-min Monitor window (just re-arm).

---

## 7. Validator + Python situation (skill)

- **`pnpm verify-skill`** (`scripts/verify-skill.mjs`) is a **faithful Node port** of the real repo
  validator's skill rules — confirmed to AGREE with `validate_repository.py` (both pass on our skill).
  Trust it over prose. `SKILL-TEMPLATE-NOTES.md` documents the rules.
- **Validator gotchas** (learned by reading `validate_repository.py`):
  - **`README.md` is FORBIDDEN in a skill dir** → long-form guidance goes in **`docs/`** (allowed).
    (Our operator guide is `skills/calle-invoice-recovery/docs/guide.md`.)
  - Required: `SKILL.md`, `references/safety.md`, `references/examples.md`.
  - Frontmatter: `name` **==** directory slug (lowercase kebab); **`description` ≥ 40 chars AND must
    contain "phone" or "call"**.
  - Every `scripts/…` (and "actionable" `references/…`) path referenced **in SKILL.md** must exist.
  - CJK chars and old-repo-name strings are rejected.
  - **NOT enforced on skills** (a common wrong assumption): CRLF / trailing whitespace / secrets / PII /
    E.164 — those checks are Dify-plugin-only. We keep LF (`.gitattributes`) + a secret scan as advisory only.
- **Python is NOT installed.** A system install was attempted and **failed** (`Error 0x80070003`, an MSI
  caching failure in the headless shell — NOT a UAC problem). Do not retry the system install headlessly.
  Instead, an **MD5-verified embeddable Python 3.12.7 is set up** in the scratchpad:
  - `…/scratchpad/pyembed/python.exe` (its `python312._pth` has the clone's `scripts/` dir appended so
    the validator's local imports resolve).
  - `…/scratchpad/awesome-phone-call-agents/` — a clone of the target repo.
  - To run the real validator: copy `skills/calle-invoice-recovery/` into the clone's `skills/`, then
    `cd <clone> && <pyembed>\python.exe scripts\validate_repository.py`. Baseline (unmodified clone)
    passes; with our skill copied in it passes too.
  - CLAUDE.md landmine: don't run `python3`/install Python; use `pnpm verify-skill`.

---

## 8. The recurring CLAUDE.md conflict (you WILL hit this)

Every queue edits `CLAUDE.md` on `auto/build`. To keep the runner pre-flight green I back-port
`CLAUDE.md` to `master`, but that gives the two branches divergent history on the same file →
**PR #1 flips to CONFLICTING**. Fix (safe when no queue is running):
```bash
cd /g/calle-invoice-agent-auto && git fetch origin
git -c core.autocrlf=false merge --no-ff origin/master     # conflicts on CLAUDE.md
git checkout --ours CLAUDE.md && git add CLAUDE.md          # keep auto/build's version (LF, all landmines)
git -c core.autocrlf=false commit --no-edit && git push origin auto/build
```
`.gitattributes` (`* text=auto eol=lf`) is committed to normalize endings. **Merging PR #1 ends this
loop permanently.**

---

## 9. Standing hard constraints (from the operator — do NOT violate)

- Do NOT create a CALL-E account or accept ToS anywhere.
- Do NOT submit the CALL-E credit request form.
- Do NOT email the hackathon organizer.
- Do NOT set `CALLE_MODE=live` or place any real call.
- Do NOT touch production Supabase or any live client sites (staging is fine).
- Do NOT open the Devpost submission or fill any form that submits the entry.
- Real-call testing is local-only, mock by default; the deployed instance is fictional data only.

---

## 10. Environment / tooling quirks

- Windows 10 (build 19045). Shells: git-bash (Bash tool) + Windows PowerShell 5.1. `winget` unavailable.
- `pnpm` 11.1.2. **Do NOT create/edit `pnpm-workspace.yaml` or add an `allowBuilds:` key** — build
  approvals (`esbuild`, `sharp`, `unrs-resolver`) are already configured; a hallucinated `pnpm-workspace.yaml`
  overrides them and loops (landmine in CLAUDE.md).
- `gh` CLI is installed and authenticated (used for PR #1).
- Scratchpad (embed Python, target-repo clone, downloaded installers) lives under the session temp dir:
  `…\7b37c9c0-…\scratchpad\` — it is session-scoped and may not survive a fresh session; the embeddable
  Python + clone would need re-fetching (both are MD5-verifiable from python.org / GitHub).
- Reserved fictional phone ranges used everywhere: NANP `+1555010xxxx`, UK Ofcom `+447700900xxx`,
  AU ACMA `+61491570xxx`. Singapore has no reserved range → labelled "illustrative."

---

## 11. Outstanding / next steps (in rough priority)

1. ~~Confirm CALL-E credits~~ — **DONE (2026-07-28): 200 calls granted, re-requestable after 80%.**
2. ~~Confirm deadline / Bangladesh routing~~ — **DONE (2026-07-28): deadline Sep 14 12pm SGT; BD (+880) English supported.**
3. ~~Reconcile the CALL-E limits into `SPEC.md` + the skill~~ — **DONE (2026-07-28).**
4. ~~Merge PR #1~~ — **DONE (2026-07-31): merged (merge commit `97f6d7f`); `master` now has the app,
   region facts corrected, pre-flight green. Branch `auto/build` kept.**
5. **Deploy**: ~~create the demo Supabase project → apply the 3 migrations~~ **DONE (2026-07-31):
   `calle-invoice-agent-demo` (ref `uxhapbzkoubzeqjdtipn`), 3 migrations applied, RLS on, 0 rows.**
   Still needed → **(a)** create ≥1 `auth.users` row in the demo project (app signup or dashboard →
   Authentication → Add user); **(b)** point `.env`'s `NEXT_PUBLIC_SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY` at the **demo** project (currently they target *staging* — running
   `seed-demo` as-is would reseed staging); **(c)** `pnpm seed-demo --yes`; **(d)** set Vercel env vars
   to the demo project; **(e)** deploy `auto/build`.
6. **Submit the skill PR** to `awesome-phone-call-agents` (real validator via embed Python, then `PR-BODY.md`).
7. Optional: fix the pre-existing non-fatal lint warnings (`_e`/`_params`/`_callId` unused vars in `*.test.ts`).
