---
description: Diagnose and fix a bug — root cause, not symptom
---

Fix this: **$ARGUMENTS**

## Reproduce first

Don't edit until you can see the bug happen. Run it, check logs, hit the
endpoint. If you can't reproduce it, say so and list what you tried.

## Find the root cause

State the actual cause before touching anything. "The dependency array gets a
new object every render" is a cause. "Added a null check" is a symptom patch.

## Fix

Smallest change that resolves the root cause. Then re-run the reproduction and
show it passing.

## After the edit

1. `pnpm typecheck && pnpm lint`
2. Stage only relevant files
3. Commit: `fix: <what was broken>`
4. **`git push`**

Then two lines: root cause, and how you verified.
