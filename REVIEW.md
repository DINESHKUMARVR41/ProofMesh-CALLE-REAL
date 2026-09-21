# Self-review: rubric audit

Reviewed against CLAUDE.md (four judging criteria, code conventions, removal test).
Date: 2026-07-27. Branch: auto/build.

---

## BLOCKING

**None.**

---

## Should fix

### 1. `draftArrangement` accepts `userId` as a caller-controlled parameter
**File:** `app/actions/arrangements.ts:42-63`

The `draftArrangement` server action is marked `'use server'` and uses the
service-role client (which bypasses RLS). It accepts `userId` as a plain
function parameter rather than deriving it from the authenticated session.

In Next.js, `'use server'` functions are callable from client components. A
client component could invoke this action with an arbitrary `userId` and
successfully insert an arrangement record for any user — the service-role
client will not reject it.

**Current state:** the action is not called from any client component in the
existing code (orchestrate.ts inserts its own draft directly), so the attack
surface is zero today. But the export is public and the signature is
exploitable if a client component ever calls it.

**Fix:** derive `userId` from `(await supabase.auth.getUser()).data.user?.id`
inside the action; remove the `userId` parameter from the signature.

---

### 2. Secondary query errors silently swallowed on invoice detail page
**File:** `app/invoices/[id]/page.tsx:105-106`

```ts
if (!callsRes.error) calls = callsRes.data ?? []
if (!arrangementsRes.error) arrangements = arrangementsRes.data ?? []
```

Errors from the `calls` and `arrangements` sub-queries are discarded. If
these queries fail, the user sees empty "No calls placed yet" / "No
arrangements proposed yet" sections with no error signal. A DB issue could
silently hide real call history.

**Fix:** propagate these errors to a visible error state or at least surface
them alongside the invoice data.

---

## Nitpick

### 1. `draftArrangement` is a dead export
**File:** `app/actions/arrangements.ts:42-63`

`draftArrangement` is exported but never called from any component. The
actual draft step happens inside `lib/calls/orchestrate.ts` which inserts
directly to Supabase. Dead code that could confuse future maintainers.

### 2. `console.log` in library code
**Files:** `lib/calls/orchestrate.ts`, `lib/calle/live.ts`, `lib/calle/mock.ts`

These are intentional per CLAUDE.md ("Log every CALL-E call with timing and
outcome"). They are the source of the real metrics judges can verify. No
action needed for the hackathon.

---

## Passed checks

| Check | Result | Notes |
|---|---|---|
| RLS on all new tables | PASS | `invoices`, `calls`, `arrangements` — all have RLS enabled with owner-scoped SELECT/INSERT/UPDATE/DELETE policies in `20260727000000_initial_schema.sql` |
| Service-role key never client-side | PASS | `SUPABASE_SERVICE_ROLE_KEY` only referenced in `lib/supabase/server.ts`. Both importer pages (`app/invoices/page.tsx`, `app/invoices/[id]/page.tsx`) are Server Components (no `'use client'`). Never exposed as `NEXT_PUBLIC_`. |
| No secrets committed | PASS | `.env` is gitignored and confirmed never committed (`git log -- .env` returns nothing). `.env.example` has only `<placeholder>` values. |
| No empty catch blocks | PASS | All catch blocks either rethrow, assign to an error state variable, or record to the structured log before rethrowing (see `lib/calle/logging-client.ts`). |
| No leftover `console.log` (unexpected) | PASS | All `console.log` calls are intentional CALL-E logging per CLAUDE.md; test files have diagnostic logs that are appropriate. |
| No unmeasured metric in README or UI | PASS | README metrics table contains explicit `TODO` placeholders with a clear caveat: "No real calls have been placed yet. These will be filled from actual run logs." Compliant with CLAUDE.md rule 3. |
| Removal test | PASS | Removing `lib/calle/` breaks `orchestrateCall()` at three points: `calle.placeCall()` (step 3), `calle.getCallStatus()` (step 5 polling loop), `calle.getTranscript()` (step 6). No fallback path exists. CALL-E is load-bearing. |
| No autonomous actions without approval | PASS | State machine enforces `drafted → approved → executed`; DB trigger `prevent_unapproved_execution` is a second enforcement layer. |
