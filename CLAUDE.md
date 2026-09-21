# Project Instructions

## Hackathon

- **Name:** CALL-E: Your Code Is Calling (sponsor: AIRUDDER Pte Ltd, Singapore)
- **Track:** One general pool — no separate partner tracks. $10k total: $4k Most Practical, $3k Most Innovative, 2×$1k Honorable Mention, 5×$200 Most Valuable Feedback.
- **Deadline (CONFIRMED):** **Sep 14, 2026, 12:00pm SGT** — confirmed via the official CALL-E credits request form (no longer ambiguous). That is **10:00am Bangladesh time, Sep 14**, so the last full working night is **Sep 13**.
- **Required stack:** CALL-E must be **imported and called at runtime** (SDK / API / MCP / CLI / SKILL — any one). Judging explicitly rejects "referenced, not called." Our stack above it: Next.js (App Router) / Supabase / Vercel / TypeScript.
- **Judging criteria:** 4 criteria, **no published weights** — Real World Impact, Quality of the Idea, Technical Implementation, Product Experience & Demo. Two-stage: a pass/fail viability gate (does it fit the theme and actually call CALL-E) then full evaluation. Note: 3 of 4 criteria are non-technical, and the demo video is explicitly scored — the demo layer is not wasted effort here.

## What we're building

Overdue-invoice recovery calls for freelancers and small agencies: an agent that phones a client about an unpaid invoice, holds a polite multi-turn conversation, offers a payment arrangement, and logs the outcome — with every action approval-gated, not autonomous. Submission is a **reusable skill/plugin** (see landmine below). **Bangladesh (+880) is now a supported recipient region (English only)**, so a Chittagong-based freelancer can chase **local overdue-invoice clients directly** as well as clients abroad — all in **English** (Bengali is unsupported).

## Why we're credible on this

We operate this workflow for real — Devixus Finance tracks overdue invoices and partial payments across live agency clients. Months designing debt-resolution call flows (payment-arrangement logic, guardrails, persona scoping, failure modes) give real fluency in where these calls go wrong. Chittagong ground truth on how these chase conversations actually go is unfakeable. AIRUDDER's core market is outbound calling in emerging Asia, so this builds into the sponsor's thesis, not beside it. **Use the domain knowledge, not any client's code, persona, or data — that is the client's IP.**

---

## Hackathon rules — binding

These override convenience. If a decision conflicts, the rule wins.

1. **Removal test.** Delete CALL-E — does the product still work? If yes, the integration is decorative. It must be load-bearing (it is: no calls, no product).
2. **Required stack is the floor, not the differentiator.** Calling CALL-E earns zero points on its own. Differentiate above it — conversation design, approval workflow, invoice-recovery domain logic.
3. **Never publish an unmeasured metric.** A real small number beats an invented big one. If it wasn't measured from a real run, it doesn't go in the README, the demo, or the submission. (This is the Flood Sentinel lesson — do not repeat it.)
4. **Depth beats polish** — but here 3 of 4 criteria are non-technical and the video is scored, so "polish" includes a clear demo. Cut demo *shine* before integration depth; don't cut the demo.
5. **Effort goes into partner-integration depth**, then the demo, then everything else.
6. **Lead with domain expertise.** The invoice-recovery + real-agency-ops angle is the spine of every artifact, not decoration.
7. **Build to the rubric.** Re-read the 4 criteria before each build session.

---

## Working agreement

Read before writing. Grep for existing patterns before inventing new ones.

Smallest change that fully solves the problem. No speculative abstraction — one deadline, no second version.

**There must be a demoable state at all times.** Never leave the project broken between tasks. If a change can't be finished, revert rather than commit half-wired.

If a task is ambiguous, ask one question rather than building the wrong thing.

Don't report success on code you haven't run.

**Log every CALL-E call with timing and outcome.** Judges ask how it works; logs are the answer, and they are where the *real* metrics come from. Invented metrics get caught.

---

## After every edit

1. `pnpm typecheck && pnpm lint`. Fix what broke.
2. Verify the app still starts and the demo path still works.
3. Stage only the files relevant to this change.
4. Commit — `feat:` / `fix:` / `chore:` / `refactor:`.
5. **`git push`** — always. A commit that isn't pushed didn't happen.

Never commit `.env`, credentials, API keys, CALL-E account details, or any client data.

---

## Code conventions

**TypeScript** — strict. No `any`; use `unknown` and narrow.

**Next.js** — Server Components by default. `'use client'` only for state, effects, or browser APIs.

**Supabase** — RLS on every table. Service-role key never reaches the client. Schema changes via migrations in `supabase/migrations/`, never hand-edited in the dashboard.

**Tailwind** — utilities inline. Extract a component at the third repetition.

**Errors** — handle them. No empty catch blocks, no swallowed promises.

**CALL-E logging** — every call to the CALL-E API logged with timing, cost (calls are finite), and transcript reference.

---

## Brand tokens

```css
:root {
  --ink: #0A0A0B;
  --pulse: #5C4BFF;
  --glow: #C9FF3B;
  --mist: #F5F4F0;

  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Geist', system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, monospace;
}
```

Glow is a signal, never more than 8% of a surface. Primary CTA is a Pulse pill. Cards 12px radius, inputs 8px, buttons pill. No sparkle/star icons, gradient meshes, glow orbs, tech-grid backgrounds, "AI-powered" copy, or emoji.

---

## Never do without asking

- Destructive SQL on any shared database
- Deploy to production
- Modify DNS, domain, or SSL settings
- Rotate or regenerate credentials
- Force-push, rewrite history, delete a branch
- Incur a charge, change a billing plan, or **spend CALL-E call credits in a script/loop** (they're finite — see landmines)
- Create an account on a third-party service or accept terms of service
- Touch anything outside this project directory

---

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
```

## Known landmines

- **20 free CALL-E calls total**, for dev AND demo. One debugging session burns them. Request more via the CALL-E form BEFORE building anything. If you find yourself conserving calls, you're fighting the infrastructure — stop and get more credits.
- **pnpm build approvals are already configured** in `pnpm-workspace.yaml` (`onlyBuiltDependencies`: esbuild, sharp, unrs-resolver). Do NOT create or edit `pnpm-workspace.yaml`, do NOT add an `allowBuilds:` key (not a real pnpm setting), and do NOT run `pnpm approve-builds`. If `pnpm install` ever prints `ERR_PNPM_IGNORED_BUILDS`, the approval already exists — just proceed; trying to "fix" it loops.
- **Migrations are applied to staging out-of-band** (by the operator, via the Supabase MCP). Do NOT run `supabase db push`, `supabase link`, `supabase migration up`, or otherwise try to apply/push migrations yourself — there are no DB credentials in this environment and it will loop until the task times out. Treat the SQL in `supabase/migrations/` as already live. If a DB write fails on a missing column/table, STOP and write `BLOCKED.md` — do not try to fix the schema.
- **Python is not installed here.** The target repo's `validate_repository.py` cannot run. Use **`pnpm verify-skill`** (the Node equivalent, `scripts/verify-skill.mjs`) to validate the skill folder. Do NOT run `python3 …` or try to install Python — it hits the Windows Store stub and fails. The real `validate_repository.py` is run manually (with Python, against a clone of the target repo) before the PR is submitted.
- **Bangladesh IS a supported recipient region (English to +880)** — confirmed by CALL-E's team in Discord (2026-07-28); the route provider enabled it. **Bengali is still NOT a supported language** — calls to +880 go out in **English only**. The demo places English calls to **Bangladesh (+880)**. Do NOT build a Bengali-language call path (it cannot be placed); English-to-Bangladesh IS fine.
- **Submission is a pull request** to `github.com/CALLE-AI/awesome-phone-call-agents` under a Contribution Area — not a hosted app. Hosted demo is optional. Reusability by the community is a scored criterion, so build a **reusable skill/plugin**, not a one-off product. Read that repo's README to pick the Contribution Area before designing.
- **Two repos, two jobs:** `call-e-integrations` for setup, `awesome-phone-call-agents` for the submission PR.
- **Deadline CONFIRMED: Sep 14, 2026, 12:00pm SGT** (official CALL-E credits request form) = 10:00am Bangladesh time — see top of file.
- **Demo video ~3 min**, public on YouTube/Vimeo. It's scored — budget real time for it near the end.
- **The deployed app has no authentication and reads via the service-role client — every row in the deployed database is publicly readable.** Real client names, real invoice amounts, and real phone numbers must never be written to the demo project. Seed only the fictional data in `scripts/seed-demo.ts`. Real-call testing (CALLE_MODE=live) runs locally only, against a local `.env.local` that is never committed. If you are unsure whether data is fictional, do not write it.
