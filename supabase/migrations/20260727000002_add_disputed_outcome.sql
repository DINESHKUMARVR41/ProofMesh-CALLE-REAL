-- Add 'disputed' to calls.outcome so a dispute is distinguishable from a refusal.
-- Previously both collapsed to 'refused', which hid distinct next-actions
-- (dispute → email within 1 business day, no further calls until resolved;
--  refusal → operator decides write-off / settlement / collections referral).

alter table public.calls
  drop constraint calls_outcome_check,
  add constraint calls_outcome_check
    check (outcome in ('paid', 'committed', 'callback', 'no_answer', 'refused', 'error', 'disputed'));
