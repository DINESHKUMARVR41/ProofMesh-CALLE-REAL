---
description: Verify, build, and deploy to a preview URL
---

Ship: **$ARGUMENTS** — if empty, ship the current branch.

## Pre-flight

Stop at the first failure. Don't deploy past a red check.

```bash
git status          # working tree clean
pnpm typecheck
pnpm lint
pnpm build
```

Check for unapplied migrations on the target environment. If any, list and stop.

## Deploy

Deploy to a preview URL. Then load it and confirm it renders — a green build is
not a working site. Walk the demo path end to end.

## Report

- Preview URL
- What changed
- Manual steps needed: env vars, migrations, cache purge
- What I should click through

Promoting to production is mine. Tell me it's ready and wait.
