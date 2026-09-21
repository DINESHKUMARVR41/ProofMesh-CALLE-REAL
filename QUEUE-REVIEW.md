# QUEUE-REVIEW — Phase F (scheduled drafting + batch approval + dialer)

Adversarial review of the Phase F surfaces: the sweep (`/api/cron/sweep`, `pnpm
sweep`), the batch-approval `/queue` page + its server actions, and the dialer
(`/api/cron/dial`, `pnpm dial`, `claim_next_call`). Reviewed as someone trying to
abuse them. **No fixes made in this task** (per the task); findings are
severity-tagged. The deployment is `CALLE_MODE=mock`, so no real phone rings today;
the live-only findings are about the moment `CALLE_MODE` is flipped to `live`.

Complements `ABUSE-REVIEW.md` (the public judge call flow); the per-destination cap
(B1) recommended there is enforced again in the dialer here.

---

## Should fix

### S1 — The autonomous dialer path has no total spend cap (live only)

The public judge flow is bounded by a hard total budget (`DEMO_CALL_BUDGET`). The
dialer path (approved `call_queue` entries) has **no equivalent total/daily cap**.
Its spend is bounded by: the `CRON_SECRET` gate, dialing only human-**approved**
entries, one-at-a-time (`claim_next_call` concurrency = 1), the per-destination cap
(2 / 24h), and calling hours. So one client cannot be hammered, and nothing dials
without approval — but if an operator approves a large batch (or a bug over-drafts and
is approved), every approved call eventually dials with no ceiling.

- **Impact (live only):** unbounded credit spend across many *distinct* destinations,
  up to however many calls were approved.
- **Recommended fix (before live):** a configurable daily/total dial cap in
  `claim_next_call` (e.g. refuse to lease once N calls have `dialed_at` in the last
  24h), mirroring `DEMO_CALL_BUDGET`.
- **Gate:** decide S1 before setting `CALLE_MODE=live`.

---

## Nitpick

### N1 — `CRON_SECRET` comparison is not constant-time

`isAuthorizedCron` compares `Authorization` to `Bearer ${CRON_SECRET}` with `===`. A
timing side-channel on a high-entropy secret over the network is not practically
exploitable, but a constant-time compare is cheap. Set a long random `CRON_SECRET`
regardless (it is the sole trust boundary for the cron routes).

### N2 — Terminal states are enforced in the app, only partially in the trigger

`dropped` / `completed` / `expired` are terminal in the app state machine, and no app
path moves them back toward dialing (approval only touches rows still `status =
'drafted'`; the dialer leases only `approved`). The DB trigger
(`enforce_call_queue_transitions`) enforces the two dangerous cases —
no-dialing-without-approval and no-approving-an-expired-draft — but does **not**
forbid a raw transition out of `dropped`/`completed` (e.g. `dropped -> approved`).
Only the server-side service-role can write such a transition, so it is not
attacker-reachable; extending the trigger to reject transitions out of terminal
states would be defense-in-depth.

### N3 — Calling hours use one representative timezone per region

`lib/queue/calling-hours.ts` maps each region to a single representative IANA zone.
For multi-zone regions (US, CA, AU, BR, ID) a client in a different sub-zone could be
dialed up to a few hours outside their true local window. Documented in the source; a
real deployment should derive the zone from the number's area code or a per-client
setting.

---

## Checked and OK (not findings)

- **Cron-route protection.** Both `/api/cron/sweep` and `/api/cron/dial` require
  `Authorization: Bearer $CRON_SECRET` (`isAuthorizedCron`), and **fail closed** when
  `CRON_SECRET` is unset (every request 401s). An external caller without the secret
  cannot trigger either route. Vercel Cron injects the header automatically, so
  `CRON_SECRET` **must** be set in production for the crons to run at all (deploy
  requirement, see DEPLOY / the handoff report).
- **External-trigger budget drain — sweep.** The sweep only **drafts** (inserts
  `call_queue` rows); it never contacts CALL-E and spends no credit. It is idempotent
  (partial unique index `call_queue_one_open_per_invoice`), so repeated triggering
  drafts nothing new. No credit path exists.
- **External-trigger budget drain — dialer.** Gated by `CRON_SECRET`; dials only
  approved entries, one at a time, capped 2/destination/24h, within calling hours.
  Repeated triggering cannot exceed those bounds — `claim_next_call` returns nothing
  while a call is in flight or when the cap/hours exclude every candidate. The only
  credits it can spend are for calls a human already approved (bounded further only by
  S1).
- **Draft resurrection.** `dropped` / `expired` / `completed` cannot re-enter the
  dialing path via any app action: `approveQueueEntries` updates only rows still
  `status = 'drafted'` (and `assertCanApprove` rejects non-drafted or expired);
  `claim_next_call` leases only `approved`; the DB trigger blocks approving an expired
  draft. A dropped/expired entry frees the one-open-per-invoice slot, so the next sweep
  may create a **fresh** draft — that is intended re-drafting, not resurrection of the
  old row. (Direct DB resurrection needs the service-role key — server-only; see N2.)
- **Stale draft never dials.** A `drafted` row past `expires_at` is refused approval by
  both `assertCanApprove` and the trigger, and `expireStaleDrafts` sweeps it to
  `expired`. It can never reach `dialing` (which requires `approved`).
- **Double-dial / concurrency.** `claim_next_call` is advisory-locked, atomically marks
  one entry `dialing`, and refuses to lease while any entry is already `dialing` — two
  concurrent ticks place at most one call. Verified live against staging.
- **Removal test (CALL-E load-bearing) — still passes.** The dialer places via
  `getCalleClient()` → `CalleClient.placeCall` / `getCallStatus` / `getTranscript`;
  delete `lib/calle/` and the dialer cannot place or record a call. The sweep contacts
  CALL-E not at all — correctly, because drafting is not calling. CALL-E remains
  load-bearing for every actual call.
- **No unmeasured metric crept in.** Phase F adds no performance/metric claim. The
  README metrics table stays TODO placeholders; the new README / PR-BODY / this file
  are qualitative. No invented figures.
- **RLS / exposure.** `call_queue` has RLS enabled with owner-scoped policies; like the
  other tables the deployed app reads it via the service-role client (fictional demo
  data only — the existing two-environment exposure model is unchanged). No secret
  reaches the client: the `/queue` server actions and both cron routes are server-only.
- **PII in logs.** The dialer/mock path masks the destination (`maskPhone`) — confirmed
  in the live mock dial (`+155*****301`). No full number reaches the new log lines
  (consistent with S1 in ABUSE-REVIEW).

---

## Gate before `CALLE_MODE=live`

Do not flip `CALLE_MODE` to `live` until: **S1** (dialer spend cap) is decided;
`CRON_SECRET` is set to a strong random value (N1); and `DEMO_IP_SALT` /
`DEMO_CALL_BUDGET` are set for the judge flow (per ABUSE-REVIEW). B1's per-destination
cap is already enforced in both the judge flow and the dialer.
