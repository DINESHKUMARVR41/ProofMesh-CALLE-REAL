-- Arrangement draft-then-approve state machine
-- Adds status column and DB-level trigger that prevents executing unapproved drafts.
--
-- State machine: drafted -> approved -> executed
--                drafted -> rejected
--                approved -> rejected  (withdraw before execution)
--
-- The trigger is the data-layer backstop — the server action also calls
-- assertCanExecute() before reaching the DB, so the trigger catches any
-- path that bypasses the application layer.

alter table public.arrangements
  add column status      text        not null default 'drafted'
    check (status in ('drafted', 'approved', 'rejected', 'executed')),
  add column approved_at  timestamptz,
  add column rejected_at  timestamptz,
  add column executed_at  timestamptz;

-- ────────────────────────────────────────────────
-- Data-layer enforcement: prevent execution without approval
-- ────────────────────────────────────────────────
create or replace function public.prevent_unapproved_execution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'executed' and not old.human_approved then
    raise exception
      'Cannot execute arrangement %: human_approved is false', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger arrangements_enforce_approval
  before update on public.arrangements
  for each row
  execute function public.prevent_unapproved_execution();
