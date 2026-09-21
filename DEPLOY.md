# Deploying to Vercel

How to deploy this Next.js app (the CALL-E invoice-recovery reference implementation)
to Vercel. **You run the deploy** — this doc is the exact prep and settings.

---

## 0. What's already done (no action needed)

- **Framework**: Next.js 15 (App Router). Vercel auto-detects it — no `vercel.json`,
  no custom build/output settings required. Build = `next build`, install = `pnpm install`
  (auto-detected from `pnpm-lock.yaml`).
- **Render mode fixed for deploy**: `app/invoices/page.tsx` and `app/invoices/[id]/page.tsx`
  now export `dynamic = 'force-dynamic'`. Without this, `/invoices` was statically
  prerendered at build (hitting Supabase during `next build`), which would fail the build
  if build-time env was missing and would otherwise bake a stale data snapshot. They now
  render at request time against live Supabase. **Verified: `next build` passes with no
  `.env` present** (route table shows both as `ƒ` Dynamic).
- **`next.config.ts`** is empty and needs no changes.

---

## 1. Two-environment model

### Why the split exists

The app has **no authentication layer**. Every page reads data through the
**service-role client** (`lib/supabase/server.ts`), which bypasses Row Level Security.
As a result, **any row in the deployed database is publicly readable** — anyone with the
Vercel URL can see the entire contents of the database without logging in.

This is fine for a public demo of fictional data. It is **not** acceptable for real
operator data. The solution is a hard environment split:

| | DEMO project | LOCAL project |
|---|---|---|
| **Supabase project** | A separate project, created fresh | `calle-invoice-agent-staging` (`sjobbksiksixqpfvliyf`) |
| **Contains** | Only fictional seed data | Real CALL-E test runs, live schema |
| **Deployed to Vercel?** | **Yes** — Vercel points here | **Never** — local `.env` only |
| **Who can read it** | Anyone with the Vercel URL | You only, via local `.env` |
| **Real invoice/client data allowed?** | **Never** | Yes — this is the right place for real testing |

**The LOCAL project is the existing staging project.** Your local `.env` already points
at it (`sjobbksiksixqpfvliyf`, `ap-south-1`). Use it for real CALL-E testing sessions.
It is never connected to Vercel and never exposed publicly.

**The DEMO project must be created fresh.** It starts empty, gets the three migrations
applied, gets the fictional seed loaded, and then Vercel is pointed at it. After that,
only `pnpm seed-demo --yes` ever writes to it — and only fictional data.

> **Warning: real invoice or client data must never be written to the demo project.**
> The demo project has no auth gate. Its entire contents are readable by anyone with
> the Vercel URL. Treat it as permanently public.

---

## 2. Creating the demo project (step-by-step)

Do this once before the first Vercel deploy, or any time you need a clean demo reset.

### Step 1 — Create a new Supabase project

1. Go to [app.supabase.com](https://app.supabase.com) → **New project**.
2. Name it something distinct — e.g. `calle-invoice-agent-demo`.
3. Choose a region. Singapore (`ap-southeast-1`) fits the demo narrative.
4. Save the project **URL** (`https://<ref>.supabase.co`) and both API keys
   (**anon** and **service_role**) from Settings → API.

### Step 2 — Apply the migrations

Migrations live in `supabase/migrations/`. Apply them **in order** via the Supabase SQL
Editor (Dashboard → SQL Editor → New query, paste and run each file):

1. `supabase/migrations/20260727000000_initial_schema.sql`
2. `supabase/migrations/20260727000001_arrangement_status.sql`
3. `supabase/migrations/20260727000002_add_disputed_outcome.sql`

> Do **not** run `supabase db push`, `supabase migration up`, or `supabase link` — there
> are no local DB credentials and it will time out. Run the SQL directly in the
> dashboard SQL editor.

### Step 3 — Seed fictional data

Temporarily point your local `.env` at the demo project:

```
NEXT_PUBLIC_SUPABASE_URL=https://<demo-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<demo anon key>
SUPABASE_SERVICE_ROLE_KEY=<demo service_role key>
```

Then run:

```bash
# dry run — prints target URL and exits without writing anything
pnpm seed-demo

# live run — truncates core tables and loads fictional rows
pnpm seed-demo --yes
```

The seed script reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from
`.env`. **Confirm you are pointed at the demo project before running `--yes`** — the
truncation is intentionally destructive.

After seeding, restore your local `.env` to the LOCAL project if you want to continue
real testing locally.

### Step 4 — Set Vercel environment variables

In Vercel → Project → **Settings → Environment Variables**, set these for **Production**
(and **Preview** if you want preview deploys to work). Use the demo project's values,
not the LOCAL staging project's values.

| Variable | Source | Scope | Secret? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Demo project URL | Build **and** runtime | No (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Demo project anon key | Build **and** runtime | No (ships in browser bundle) |
| `SUPABASE_SERVICE_ROLE_KEY` | Demo project service_role key | Runtime (server only) | **Yes — never expose to client, never commit** |
| `CALLE_MODE` | `mock` | Runtime | No |

Do **not** set `CALLE_API_KEY` unless you are intentionally placing real calls.
Do **not** set `CALLE_MODE=live` for the demo — live mode places real phone calls and
spends finite CALL-E credits.

Notes:
- **`NEXT_PUBLIC_*` are inlined into the client bundle at build time.** They must be set
  before the build; changing them later requires a redeploy.
- **`SUPABASE_SERVICE_ROLE_KEY` is server-only.** It is read only in
  `lib/supabase/server.ts` and is never bundled to the browser.

---

## 3. Which branch to deploy

The app lives on the **`auto/build`** branch. `master` currently holds only the docs —
it does **not** contain the app yet (PR #1 merges `auto/build → master`).

- **Option A (recommended for now):** point Vercel's Production Branch at **`auto/build`**.
- **Option B:** merge PR #1 first, then deploy `master`.

---

## 4. Exact deploy steps

1. **Connect the repo** to Vercel (New Project → import `minhaz1221/calle-invoice-agent`).
2. **Framework preset**: leave as **Next.js** (auto-detected). Leave Build & Output
   settings at their defaults.
3. **Production Branch**: set to `auto/build` (see §3) under Settings → Git.
4. **Add the environment variables** from §2 Step 4 (Production, and Preview if desired).
5. **Confirm the demo Supabase project is active** — free-tier projects pause when idle;
   wake it by visiting the dashboard before a demo.
6. **Deploy** (Vercel builds on push, or trigger manually). The build runs
   `pnpm install` then `next build`; it does **not** need Supabase reachable at build time.

---

## 5. After it deploys — quick checks

- Open `/` — the brand/design-system page (static) renders.
- Open `/invoices` — the invoice list renders from demo data (server-rendered).
- Open an invoice detail (`/invoices/<id>`) — call history + arrangements render.
- View source / network on `/invoices`: confirm **no** `service_role` key appears in any
  client asset (it must only ever be server-side).
- Confirm no real call was placed anywhere — `CALLE_MODE` should read `mock`.

---

## 6. Resetting demo data

`pnpm seed-demo` truncates the three core tables (`arrangements`, `calls`, `invoices`)
and re-seeds them with the fictional data from `supabase/seed/demo.sql`.

**This script is for the demo project only.** It is intentionally destructive — run it
only against the demo Supabase project. Never run it against the LOCAL staging project
if it contains real test data you want to keep.

The script refuses to truncate without an explicit confirmation flag:

```bash
# dry run — prints the target URL and exits
pnpm seed-demo

# live run — truncates and re-seeds
pnpm seed-demo --yes
```

Prerequisites:
- `.env` must contain `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
  pointing at the **demo** project.
- At least one user must exist in `auth.users` (sign up at the app first). The seed
  attaches all rows to the first user found.
- All three migrations must already be applied to the demo project (see §2 Step 2).

---

## 7. Gotchas

- **`master` has no app yet** — deploying `master` before PR #1 merges yields a docs-only
  build. Deploy `auto/build`, or merge first.
- **`NEXT_PUBLIC_*` changes need a redeploy** (they're build-time inlined).
- **pnpm build approvals**: `pnpm-workspace.yaml` pre-approves `esbuild`, `sharp`,
  `unrs-resolver` builds. Vercel's `pnpm install` honors this. If Vercel's pnpm version
  ever rejects the lockfile, set the pnpm version in Project Settings — not expected to
  be needed.
- **Don't deploy with `CALLE_MODE=live`** unless you intend real calls; keep it `mock`.
- **Free-tier projects pause when idle.** Confirm the demo project is active in the
  Supabase dashboard shortly before a demo or judge review.
- **The LOCAL project (`sjobbksiksixqpfvliyf`) is never the deploy target.** Its env
  vars must not appear in Vercel settings. If you accidentally point Vercel at the LOCAL
  project and real test data is in there, that data becomes publicly readable.
