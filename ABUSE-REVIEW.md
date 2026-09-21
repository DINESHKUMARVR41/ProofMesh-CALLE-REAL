# ABUSE-REVIEW — public judge call endpoint (Phase E)

Adversarial review of the public, unauthenticated call flow: `/invoices/[id]`
panel → `draftDemoCall` / `placeDemoCall` / `pollDemoCall` server actions →
`demo_calls` guard (demo project) → CALL-E. Reviewed as someone trying to abuse
it. **No fixes made in this task** (per the task); findings are severity-tagged.

The deployment is currently `CALLE_MODE=mock`, so no real phone rings today. The
Blocking finding below is about the moment `CALLE_MODE` is flipped to `live`.

---

## Blocking

### B1 — No per-destination cap: the budget can be aimed at one number (harassment)

The caps bound *total* volume — a hard total budget (`DEMO_CALL_BUDGET`, default
60), a global rate limit (1 / 2 min), and a per-IP limit (2 / 24 h) — but nothing
limits how many calls target **one destination number**. A determined caller
rotating IPs (see S2) could ring a single victim's phone up to the entire budget,
spaced 2 minutes apart. Once `CALLE_MODE=live`, that is real, repeated automated
calls to a person who did not ask for them.

- **Impact (live only):** targeted harassment of one number, up to the full budget.
- **Recommended fix (before live / before Phase F's dialer):** add a
  per-destination cap in `reserve_demo_call` — e.g. reject if the same
  `destination_masked` has been called in the last 24 h (or more than once). The
  masked destination is already stored, so this is a small addition to the
  advisory-locked reservation.
- **Gate:** do **not** set `CALLE_MODE=live` until B1 is fixed.

---

## Should fix

### S1 — Full phone number written to server logs

The number is stored **masked** in `demo_calls`, and validation never logs it. But
`lib/calle/mock.ts` logs the recipient object (which includes the full `phones[]`),
and `lib/calls/orchestrate.ts` logs the full `toPhone`. In the deployed **mock**
demo, the judge's own full number therefore lands in Vercel function logs; in
`live` the orchestrator path is not used by the web flow, but the mock path is what
runs today. Logs are not publicly readable, but a full number should not sit in
them. **Fix:** mask the number in all CalleClient/orchestrator log lines.

### S2 — Per-IP cap is bypassable by IP rotation (budget drain)

The per-IP cap (2 / 24 h) is a soft deterrent; an attacker with many IPs (proxies,
botnet) gets 2 each. The **hard** protection is the total budget + global rate
limit, so damage is bounded to the budget — but a determined attacker can still
*exhaust* the whole 60-call budget (denial-of-budget: judges then see "budget used
up"). **Options:** keep the budget modest, add a short global per-hour sub-cap, or
add lightweight friction (proof-of-work / a challenge / Vercel BotID) if abuse is
observed. Acceptable to ship for a time-boxed judging window; revisit if abused.

---

## Nitpick

### N1 — `DEMO_IP_SALT` defaults to an in-repo constant

IP hashing falls back to a hardcoded salt in the source (public repo), so IP hashes
are computable by anyone with the code. It only feeds the per-IP cap, so knowing it
grants no bypass beyond S2 — but set a real `DEMO_IP_SALT` env in production anyway.

### N2 — `demo_calls` RLS enabled with no policies (Supabase advisory `rls_enabled_no_policy`, INFO)

**Intentional, not a gap.** The table is server-only: anon/authenticated get
nothing, and the service-role client plus the `SECURITY DEFINER` functions bypass
RLS. Documented here so the advisory isn't mistaken for a missing policy.

### N3 — Reservation serialized by a transaction advisory lock

`reserve_demo_call` takes `pg_advisory_xact_lock` so cap checks + insert are atomic
under concurrency. Correct for cap integrity; at a 60-call budget the throughput
cost is negligible.

---

## Checked and OK (not findings)

- **Calling the server action directly** (bypassing the UI): every check —
  destination validation, region derivation, all three caps — runs server-side in
  `runDemoCall`. The UI is not a trust boundary; a direct call is still guarded.
- **Cookie clearing:** caps key off an IP hash and global counters, not cookies —
  clearing cookies changes nothing.
- **Region spoofing:** the region is derived from the number; a mismatched claimed
  region is rejected server-side (`region_mismatch`, tested).
- **Invoice-id swap:** the id only selects which **fictional** seeded invoice fills
  the script; the client cannot supply script text, so there is no content
  injection. All deployed data is fictional per the demo-exposure rule.
- **Secret exposure:** the CALL-E API key and the Supabase service-role key are used
  only in server actions / the server client; nothing secret reaches the client
  bundle (the panel receives only an invoice id and calls server actions).
- **Removal test:** delete CALL-E and the flow does nothing — CALL-E is
  load-bearing (no calls, no product).
