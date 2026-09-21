# Split Review — Demo / Local Environment Verification

Verified 2026-07-28. No code was modified during this review.

---

## 1. Build without `.env` (Vercel-safe)

**Result: PASS**

`.env` was temporarily renamed, `pnpm build` was run, `.env` was restored.

```
Route (app)                              Size  First Load JS
┌ ○ /                                   123 B         103 kB
├ ○ /_not-found                         994 B         104 kB
├ ƒ /invoices                           164 B         106 kB
└ ƒ /invoices/[id]                      164 B         106 kB
```

Both Supabase-dependent pages (`/invoices`, `/invoices/[id]`) are `ƒ` Dynamic — they
render at request time, not at build. The build does not touch Supabase and does not
need any env vars present. ESLint warnings only (unused prefixed vars in test files);
no errors; exit 0.

The `force-dynamic` exports in `app/invoices/page.tsx:10` and
`app/invoices/[id]/page.tsx:8` are the load-bearing fix. Removing them would cause
Next.js to statically prerender those routes at build time, failing the build on Vercel
where build-time Supabase env vars are not set.

---

## 2. Seed script analysis

**Result: WOULD APPLY CLEANLY — prerequisites documented**

The seed was not run against any database in this review (guardrails: no destructive
SQL, no write to staging). Analysis of `scripts/seed-demo.ts`:

| Check | Result |
|---|---|
| `--yes` guard prevents accidental truncation | PASS |
| Exits with error if env vars missing | PASS |
| Exits with clear message if `auth.users` is empty | PASS — documented in DEPLOY.md §6 |
| Delete order respects FK constraints | PASS — arrangements → calls → invoices |
| Fixed UUIDs make re-runs idempotent | PASS |
| All data fictional | PASS — see §4 below |

**One prerequisite for a "fresh target":** the demo project must have at least one
signed-up user before the seed will run. The seed attaches all rows to `users[0].id`.
An empty `auth.users` exits with "sign up at the app first". This prerequisite is
documented in DEPLOY.md §6 ("Prerequisites") but is not an error — it is intentional
so the seed is bound to a real user identity.

---

## 3. `pnpm verify-staging`

**Result: PASS**

Run against the local staging project (`sjobbksiksixqpfvliyf`, `ap-south-1`):

```
  OK           arrangements  — 12 expected columns present
  OK           calls          — 9 expected columns present
  OK           invoices       — 10 expected columns present
  RLS ON       arrangements
  RLS ON       calls
  RLS ON       invoices

Live row counts:
  arrangements   1
  calls          1
  invoices       1

verify-staging OK — live staging matches the migration files.
```

All three tables exist with the expected columns. RLS is enabled on every table.
Row counts are 1/1/1 — minimal staging-only test data, not the demo seed (7/6/3).
Confirms no seed has leaked into the LOCAL staging project.

---

## 4. `pnpm verify-skill`

**Result: PASS**

```
verify-skill OK — skills/calle-invoice-recovery/ passes the repo validator's skill rules.
```

All checks passed: directory slug, SKILL.md presence, YAML frontmatter, name/description
fields, description length, referenced file paths, `references/safety.md`,
`references/examples.md`, no CJK characters, no old repo name, no credential patterns.

---

## 5. Real data scan

**Result: CLEAN — no real client identifiers found**

### 5a. Phone numbers

All phone numbers in tracked files fall into one of:

| Range | Standard | Used in |
|---|---|---|
| `+15550100xxx` | NANP 555-010x — ITU reserved for fictional use | seed-demo.ts, demo.sql, references/examples.md, dry-run.ts |
| `+61491570156`, `+61491570157` | ACMA 0491 570 xxx — reserved for dramatic purposes | seed-demo.ts, demo.sql |
| `+447700900315`, `+447700900123` | Ofcom 07700 900xxx — reserved for drama/fiction | seed-demo.ts, demo.sql, adaptation-guide.md |
| `+6500000000` | Non-dialable (Singapore numbering requires `6x`, `8x`, `9x` formats after +65) | scripts/demo-call.ts (DEMO_PHONE constant) |
| `+6591234567`, `+6598765432` | Illustrative Singapore example — no reserved fictional range published | calle.test.ts, logging.test.ts, SKILL.md, adaptation-guide.md, safety.md |

The Singapore numbers (`+6598765432`, `+6591234567`) are correctly labeled "illustrative;
Singapore publishes no reserved range" in `references/adaptation-guide.md`. They appear
only in test files and documentation examples, never in the seed or call records. They
are not traceable to real clients of the operator.

No number in the seed or call records is outside a documented fictional/reserved range.

### 5b. Email addresses

| Value | Source | Status |
|---|---|---|
| `accounts@acme.example` | adaptation-guide.md | `.example` TLD — IANA reserved, cannot be a real domain |
| `accounts@devixus.example` | references/examples.md (×3) | `.example` TLD — IANA reserved |
| `j***@acmedesign.com` | references/safety.md | Pre-masked PII example (masking demonstration) |
| `jane.smith@acmedesign.com` | references/safety.md | Input side of masking example; "acmedesign.com" is a generic placeholder |

No real email addresses appear in any tracked file.

### 5c. Company names

Seed invoices use: Pemberton & Hale Ltd, Clearfield Digital Inc, Whitmore Media Group
LLC, Ashford Analytics Pty Ltd, Thornbury Creative Pty Ltd, Marlowe Digital Solutions
Inc, Highfield Consulting Ltd. Skill examples use: Northgate Digital Ltd, Summit
Creative AU Pty Ltd, Meridian Tech Solutions Ltd, Harborview Consulting Inc, Eastfield
Partners Sdn Bhd.

All are generic invented names. None match known clients or vendors of the operator.

### 5d. Operator identity ("Devixus")

"Devixus Finance" and "Devixus Studio" appear as the **calling party** persona in
`lib/calls/generate-script.ts`, `lib/calle/mock.ts`, `skills/.../scripts/dry-run.ts`,
and `skills/.../references/examples.md`. This is the operator's own business identity
(explicitly stated in CLAUDE.md), not a client's data. Its presence in the agent persona
is intentional and correct.

### 5e. Credentials

No JWTs (`eyJ…`), API keys (`sk-…`), or Supabase service-role key values appear in any
tracked file. `.env` (which holds live credentials) is gitignored and untracked —
confirmed via `git check-ignore` and `git ls-files`.

---

## Summary

| Check | Outcome |
|---|---|
| `pnpm build` without `.env` | PASS — both Supabase routes are `ƒ` Dynamic |
| Seed script logic | CLEAN — all data fictional, FK-safe delete order, idempotent UUIDs |
| Seed on truly-fresh target | Requires one auth user first (documented in DEPLOY.md §6) |
| `pnpm verify-staging` | PASS — schema matches migrations, RLS on all tables |
| `pnpm verify-skill` | PASS — skill folder passes all validator checks |
| Phone numbers in repo | CLEAN — all seed/example numbers from documented fictional ranges |
| Email addresses in repo | CLEAN — all `.example` TLD or masked |
| Credentials in tracked files | CLEAN — none found |
| Real client names in repo | CLEAN — all company names are invented |
