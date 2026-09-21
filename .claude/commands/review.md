---
description: Audit uncommitted or recent work
---

Review `git diff` plus `git diff --staged`. If both empty, review the last commit.

Scope: **$ARGUMENTS** — if empty, review the whole diff.

**Correctness** — trace the logic. Off-by-one, inverted conditions, missing `await`.

**Security** — RLS on new tables. No service-role key client-side. No secrets
committed. User input parameterised. Auth on every new route handler.

**Error and empty states** — what renders when the list is empty or the fetch
fails? Empty catch blocks?

**Responsive** — checked at 360px, 768px, 1440px.

**Convention drift** — matches the rest of the codebase, or invented a new pattern?

**Dead weight** — leftover `console.log`, commented blocks, unused imports.

**Hackathon check** — does the sponsor integration still pass the removal test?
Any metric in the README that wasn't actually measured?

Report as **Blocking** / **Should fix** / **Nitpick**, with file and line. If
nothing is blocking, say so rather than manufacturing concerns.

Report only. Fix nothing in this command.
