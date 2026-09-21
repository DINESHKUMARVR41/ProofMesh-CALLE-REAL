-- Invoice recovery agent: initial schema
-- Tables: invoices, calls, arrangements
-- RLS owner-scoped on every table

-- ────────────────────────────────────────────────
-- invoices
-- ────────────────────────────────────────────────
create table public.invoices (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  client_name         text        not null,
  amount              numeric(12, 2) not null,
  currency            text        not null default 'USD',
  due_date            date        not null,
  status              text        not null default 'pending'
                        check (status in ('pending', 'overdue', 'paid', 'disputed', 'arranged')),
  language_preference text        not null default 'en'
                        check (language_preference in ('en', 'hi', 'ar', 'vi', 'de', 'ja', 'fr', 'es', 'pt')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.invoices enable row level security;

create policy "invoices: owner select"
  on public.invoices for select
  using (auth.uid() = user_id);

create policy "invoices: owner insert"
  on public.invoices for insert
  with check (auth.uid() = user_id);

create policy "invoices: owner update"
  on public.invoices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "invoices: owner delete"
  on public.invoices for delete
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- calls
-- ────────────────────────────────────────────────
create table public.calls (
  id               uuid        primary key default gen_random_uuid(),
  invoice_id       uuid        not null references public.invoices(id) on delete cascade,
  user_id          uuid        not null references auth.users(id) on delete cascade,
  started_at       timestamptz not null,
  duration_seconds integer,
  calle_call_id    text,
  outcome          text
                     check (outcome in ('paid', 'committed', 'callback', 'no_answer', 'refused', 'error')),
  transcript_ref   text,
  created_at       timestamptz not null default now()
);

alter table public.calls enable row level security;

create policy "calls: owner select"
  on public.calls for select
  using (auth.uid() = user_id);

create policy "calls: owner insert"
  on public.calls for insert
  with check (auth.uid() = user_id);

create policy "calls: owner update"
  on public.calls for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- arrangements
-- ────────────────────────────────────────────────
create table public.arrangements (
  id              uuid        primary key default gen_random_uuid(),
  invoice_id      uuid        not null references public.invoices(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  proposed_terms  text        not null,
  human_approved  boolean     not null default false,
  client_agreed   boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.arrangements enable row level security;

create policy "arrangements: owner select"
  on public.arrangements for select
  using (auth.uid() = user_id);

create policy "arrangements: owner insert"
  on public.arrangements for insert
  with check (auth.uid() = user_id);

create policy "arrangements: owner update"
  on public.arrangements for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- auto-update updated_at
-- ────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger invoices_updated_at
  before update on public.invoices
  for each row execute procedure public.set_updated_at();

create trigger arrangements_updated_at
  before update on public.arrangements
  for each row execute procedure public.set_updated_at();

-- ────────────────────────────────────────────────
-- RLS verification helper (dev / CI use only)
-- Returns rowsecurity status for a given table list.
-- Callable by the service-role key from scripts/check-rls.ts.
-- ────────────────────────────────────────────────
create or replace function public.rls_status(table_names text[])
returns table(tablename text, rowsecurity boolean)
language sql
security definer
set search_path = public
as $$
  select t.tablename, t.rowsecurity
  from pg_tables t
  where t.schemaname = 'public'
    and t.tablename = any(table_names)
  order by t.tablename;
$$;

-- Only superusers / service-role can call this function.
revoke execute on function public.rls_status(text[]) from public;
revoke execute on function public.rls_status(text[]) from anon;
revoke execute on function public.rls_status(text[]) from authenticated;
grant  execute on function public.rls_status(text[]) to service_role;
