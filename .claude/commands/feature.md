---
description: Plan and build a feature end to end, with a review gate before code
---

Build this feature: **$ARGUMENTS**

## Phase 1 — Understand

Find the files this touches. Grep for related components, routes, types, and
tables. Identify existing patterns to follow. Note anything in the codebase
that contradicts the request.

## Phase 2 — Plan

Report back with:

1. Files you'll create and files you'll modify
2. Schema or migration changes
3. The approach in three or four sentences
4. Anything ambiguous you had to assume

**Stop and wait for approval.** No code in this phase.

## Phase 3 — Build

- Implement it, following CLAUDE.md conventions
- Handle error and empty states, not just the happy path
- Responsive if it renders anything
- Typecheck and lint, fix what breaks
- Run it and exercise the feature — don't report success on untested code

## After the edit

1. `pnpm typecheck && pnpm lint`
2. Stage only relevant files
3. Commit: `feat: <description>`
4. **`git push`**

Then two lines: what you built, and what I should know before looking at it.
