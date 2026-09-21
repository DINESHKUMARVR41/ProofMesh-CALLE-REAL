# SKILL-REVIEW.md

Audit of `skills/calle-invoice-recovery/` against the target repo's validator and
the full checklist in the task brief.

Date: 2026-07-27. Branch: auto/build.

---

## Validator result

**`pnpm verify-skill` — PASS.**

```
verify-skill OK — skills/calle-invoice-recovery/ passes structural checks
(frontmatter, required files, LF, no CJK, no secrets).
```

The Python validator (`validate_repository.py`) cannot run in this environment
(Python is not installed; the Windows Store stub would be hit instead). The Node
equivalent in `scripts/verify-skill.mjs` enforces the same skill-folder subset:
required files (`SKILL.md`, `references/safety.md`, `references/examples.md`),
frontmatter `name`/`description`, `name == slug` (kebab-case), LF line endings,
no CJK characters, no leaked secrets. All checks pass.

The real `validate_repository.py` must be run manually with Python against a clone
of `github.com/CALLE-AI/awesome-phone-call-agents` before the PR is submitted.

---

## Checklist — individual items

| Check | Result | Notes |
|-------|--------|-------|
| Frontmatter parses | PASS | `name: calle-invoice-recovery`, `description` present, `license: MIT`; well-formed `--- … ---` YAML block |
| `name` == folder slug | PASS | `calle-invoice-recovery` == `skills/calle-invoice-recovery/` |
| `name` is lowercase kebab-case | PASS | regex `^[a-z0-9]+(-[a-z0-9]+)*$` matches |
| No CRLF / `\r` in text files | PASS | Validator found no `\r` in any text file in the skill folder |
| No CJK characters | PASS | No Chinese/Japanese/Korean characters found |
| No real PII | PASS | All phone numbers are `+1555010xxxx` (NANP reserved fictional range); client names are fictional; email addresses use `.example` TLD |
| No credentials | PASS | No `eyJ…` JWT, no `sk-…` API key, no `sb_secret_…` in any file |
| No unmeasured metric | PASS | README has an explicit "Metrics — TODO" section; states "No figures are published here that were not measured from an actual run." No metric values are claimed. |
| Outcome enum consistent with `lib/calle/` | PASS (with caveat — see §Should fix #1) | All 7 skill outcomes appear in both SKILL.md and `lib/calls/outcome-map.ts` |
| Outcome enum consistent with `calls` table | PASS (with caveat — see §Should fix #1) | DB CHECK constraint: `('paid', 'committed', 'callback', 'no_answer', 'refused', 'error')`. All mapped DB values from `outcome-map.ts` are in this set. |
| Dry-run script cannot place a call | PASS | No HTTP client, no SDK import, no `fetch` call in `dry-run.ts`. Two defensive guards: exits 1 if `CALLE_MODE=live`; exits 1 if `CALLE_API_KEY` is present. Structurally incapable of dispatching. |

---

## BLOCKING

**None.**

---

## Should fix

### 1. `disputed` and `refused` collapse to the same DB outcome value

**Files:** `lib/calls/outcome-map.ts:33`, `supabase/migrations/20260727000000_initial_schema.sql:52-53`, `SKILL.md §result_schema outcome enum`

Both `disputed` (client raises an objection) and `refused` (client declines to
engage) are mapped to `'refused'` in the `calls` table:

```typescript
// lib/calls/outcome-map.ts
const CALLE_TO_DB: Record<string, DbCallOutcome> = {
  disputed: 'refused',   // dispute
  // 'refused' falls through isDbCallOutcome → 'refused'  (refusal)
};
```

The `calls.outcome` DB column cannot distinguish a dispute from a refusal after
the translation runs. To know whether a `refused` row was actually a dispute, a
query must join to `arrangements` and check for a non-null `proposed_terms` or
rely on the transcript reference — neither of which is obvious to a future
integrator.

**Operational risk:** the cooldown-enforcement logic described in
`references/safety.md` applies different rules to `disputed` (no further calls —
refer to email) vs `refused` (no further automated calls — operator decides). If
that logic reads `calls.outcome`, it cannot distinguish the two cases.

**Suggested fix:** add a `'disputed'` value to the DB CHECK constraint and map
`disputed → 'disputed'` in `outcome-map.ts`. This is a schema migration plus a
one-line code change; both files are tightly coupled to this enum and must change
together.

**Note:** SKILL.md correctly documents the current DB-value column in the outcome
table — this is not a documentation bug, it is a schema design issue.

---

### 2. `maskPhone` implementation differs between `dry-run.ts` and `references/safety.md`

**Files:** `skills/calle-invoice-recovery/scripts/dry-run.ts:121-124`, `skills/calle-invoice-recovery/references/safety.md §PII Masking Rules`

`safety.md` provides a reference implementation that preserves the original
number length:

```typescript
// safety.md version — preserves length
function maskPhone(e164: string): string {
  if (e164.length <= 4) return '****';
  return '+' + '*'.repeat(e164.length - 5) + e164.slice(-4);
}
// Result for +15550100001 (length 13): +********0001  (8 stars)
```

`dry-run.ts` uses a fixed seven stars regardless of length:

```typescript
// dry-run.ts version — fixed stars
function maskPhone(e164: string): string {
  const last4 = e164.slice(-4);
  return '+*******' + last4;
}
// Result for +15550100001: +*******0001  (7 stars)
```

The two implementations produce different outputs for the same input. The
`dry-run.ts` version is more privacy-preserving (hides the number length); the
`safety.md` reference version leaks the digit count. An operator implementing
from the safety.md reference will produce different masked output than the
dry-run script, which could cause confusion when comparing logs.

**Suggested fix:** reconcile to one canonical implementation. The `dry-run.ts`
version (fixed stars) is the better choice for privacy. Update `safety.md` to
match.

---

## Nitpick

### 1. `scripts/.gitkeep` is vestigial

**File:** `skills/calle-invoice-recovery/scripts/.gitkeep`

The `scripts/` directory now contains `dry-run.ts`. The `.gitkeep` placeholder is
no longer needed and can be deleted.

### 2. README quick-start orders dry-run before verify-skill

**File:** `skills/calle-invoice-recovery/README.md §Quick start`

Steps 3 (`pnpm dry-run`) and 4 (`pnpm verify-skill`) are ordered so the dry-run
runs before structural validation. Convention (and the target repo's expected
workflow) is to verify structure first, then run scripts. Reversing steps 3 and 4
costs nothing and makes the intent clearer.

### 3. README § Prerequisites lists "Node.js 18+" while current default is 24

**File:** `skills/calle-invoice-recovery/README.md §Prerequisites`

The minimum stated is 18+, but the project runs on Node.js 24 and the Vercel
knowledge-update notes 24 LTS as the current default. The stated minimum is
technically correct; however, if a reader on Node.js 18 encounters an issue, this
will be confusing. Update to "Node.js 20+ (24 LTS recommended)" to track current
reality.

### 4. `adaptation-guide.md §7` references `tsx scripts/demo-call.ts` which is in the project root, not the skill folder

**File:** `skills/calle-invoice-recovery/references/adaptation-guide.md:186`

`demo-call.ts` lives at the project root (`scripts/demo-call.ts`), not inside the
skill folder. Someone who has only copied the `skills/calle-invoice-recovery/`
folder will not have this script. The guide is already titled "using the reference
implementation," so this is contextually clear — but a note that `demo-call.ts` is
part of the reference implementation (not the portable skill itself) would remove
any ambiguity.

---

## Summary

The skill folder is structurally valid and passes the Node validator. No CRLF, no
CJK, no real PII, no credentials, no unmeasured metrics. The dry-run script is
structurally incapable of placing a call.

The most material issue is **Should fix #1**: `disputed` and `refused` collapse to
the same DB value, which will complicate outcome-level queries and cooldown
enforcement. This is a one-migration, one-code-change fix that should land before
the PR is submitted to avoid confusing community adopters.

**Should fix #2** (maskPhone divergence) is a documentation consistency bug —
low risk, but the `safety.md` reference implementation should match the script that
operators will actually run.

No fixes are made in this task per the task brief ("Fix nothing in this task").
