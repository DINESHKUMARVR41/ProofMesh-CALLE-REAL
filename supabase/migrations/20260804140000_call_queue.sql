-- Phase F: scheduled drafting + batch approval.
--
-- call_queue holds recovery calls that were DRAFTED on a schedule (by the sweep),
-- APPROVED by the owner as a batch, and then DIALED automatically at intervals.
-- Recurrence is visible and approval-gated: nothing reaches 'dialing' without an
-- explicit human 'approved', enforced at the data layer by a trigger (mirroring
-- the arrangements prevent_unapproved_execution backstop), not just in the UI.
--
-- Lifecycle: drafted -> approved -> dialing -> completed
--            drafted -> dropped | expired          (dropped by owner / aged out)
--            approved -> dropped                    (cancellable before dialing)
--            dialing  -> approved                   (failed call releases lease to retry)

create table public.call_queue (
  id            uuid        primary key default gen_random_uuid(),
  invoice_id    uuid        not null references public.invoices(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  script        text        not null,
  -- Destination SNAPSHOT taken at draft time (the invoice's client_phone/region).
  -- The dialer re-validates against the shared destination module before placing,
  -- so an invoice edited to an unsupported region after drafting still won't dial.
  to_phone      text,
  to_region     text,
  status        text        not null default 'drafted'
                  check (status in ('drafted', 'approved', 'dialing', 'completed', 'dropped', 'expired')),
  drafted_at    timestamptz not null default now(),
  scheduled_for timestamptz not null,
  expires_at    timestamptz not null,   -- a draft not approved by this time ages out
  approved_at   timestamptz,
  batch_id      uuid,                    -- groups calls approved together in one review
  call_id       uuid        references public.calls(id) on delete set null,  -- outcome linkage
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.call_queue enable row level security;

create policy "call_queue: owner select"
  on public.call_queue for select
  using (auth.uid() = user_id);

create policy "call_queue: owner insert"
  on public.call_queue for insert
  with check (auth.uid() = user_id);

create policy "call_queue: owner update"
  on public.call_queue for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "call_queue: owner delete"
  on public.call_queue for delete
  using (auth.uid() = user_id);

-- At most ONE open (drafted/approved/dialing) entry per invoice. This is the
-- no-duplicate-jobs safety expectation: two concurrent sweeps cannot double-draft
-- the same invoice, and a completed/dropped/expired entry does not block a later
-- threshold re-drafting the invoice.
create unique index call_queue_one_open_per_invoice
  on public.call_queue (invoice_id)
  where status in ('drafted', 'approved', 'dialing');

-- Dialer picks the next approved entry whose time has come; index that access path.
create index call_queue_due_idx
  on public.call_queue (status, scheduled_for);

create trigger call_queue_updated_at
  before update on public.call_queue
  for each row execute procedure public.set_updated_at();

-- ────────────────────────────────────────────────
-- Data-layer enforcement of the two safety guarantees:
--   (1) nothing reaches 'dialing' without having been 'approved';
--   (2) an expired draft (aged out, or past its window) cannot be approved.
-- The dialing->approved case is the dialer releasing its lease to retry a failed
-- call, so it is explicitly allowed. The app-layer state machine
-- (lib/queue/state-machine.ts) is the first line of defense; this is the backstop.
-- ────────────────────────────────────────────────
create or replace function public.enforce_call_queue_transitions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- (1) No dialing without approval. Only an already-approved row may start dialing.
  if new.status = 'dialing' and old.status <> 'approved' then
    raise exception
      'call_queue %: cannot reach dialing from %, must be approved first', new.id, old.status
      using errcode = 'check_violation';
  end if;

  -- (2) An expired draft cannot be approved — neither one already marked expired
  -- nor a drafted row whose window has elapsed. (dialing->approved, the retry
  -- lease release, is unaffected because old.status is 'dialing', not the above.)
  if new.status = 'approved'
     and (old.status = 'expired'
          or (old.status = 'drafted' and old.expires_at <= now())) then
    raise exception
      'call_queue %: cannot approve an expired draft', new.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger call_queue_enforce_transitions
  before update on public.call_queue
  for each row
  execute function public.enforce_call_queue_transitions();
