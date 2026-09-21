-- ============================================================
-- DEMO-ONLY migration — applied to the DEMO project (uxhapbzkoubzeqjdtipn),
-- NOT to staging. Kept out of supabase/migrations/ on purpose so
-- verify-staging (which scans that folder) never expects it on staging.
--
-- Budget + rate guard for the public judge-facing call endpoint. Every cap is
-- enforced here, at the data layer, inside one advisory-locked function so
-- concurrent requests cannot race past a cap. The server action calls
-- reserve_demo_call() BEFORE touching CALL-E; a denial means CALL-E is not hit.
-- ============================================================

create table if not exists public.demo_calls (
  id                 uuid        primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  ip_hash            text        not null,
  destination_masked text        not null,   -- never the full number
  region             text,
  status             text        not null default 'reserved'
                       check (status in ('reserved', 'placed', 'completed', 'failed')),
  calle_call_id      text,
  outcome            text
);

alter table public.demo_calls enable row level security;
-- No policies: anon/authenticated get nothing; only the server-side service-role
-- client (which bypasses RLS) and the SECURITY DEFINER functions below touch it.

create index if not exists demo_calls_created_at_idx on public.demo_calls (created_at);
create index if not exists demo_calls_ip_hash_idx on public.demo_calls (ip_hash, created_at);

-- ── Atomic reservation: check every cap, then insert, under one lock ──────────
create or replace function public.reserve_demo_call(
  p_ip_hash text,
  p_destination_masked text,
  p_region text,
  p_budget int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total  int;
  v_ip     int;
  v_dest   int;
  v_recent int;
  v_id     uuid;
begin
  -- Serialize all reservations so two concurrent calls cannot both pass a cap.
  perform pg_advisory_xact_lock(hashtext('demo_call_reserve'));

  select count(*) into v_total from public.demo_calls;
  if v_total >= p_budget then
    return jsonb_build_object('allowed', false, 'reason', 'budget_exhausted', 'remaining', 0);
  end if;

  select count(*) into v_ip
  from public.demo_calls
  where ip_hash = p_ip_hash and created_at > now() - interval '24 hours';
  if v_ip >= 2 then
    return jsonb_build_object('allowed', false, 'reason', 'ip_limit');
  end if;

  -- Per-destination cap (independent of IP): stops the budget from being aimed at
  -- one number via IP rotation. 2/24h = a judge can retry once, not a weapon.
  select count(*) into v_dest
  from public.demo_calls
  where destination_masked = p_destination_masked and created_at > now() - interval '24 hours';
  if v_dest >= 2 then
    return jsonb_build_object('allowed', false, 'reason', 'destination_limit');
  end if;

  select count(*) into v_recent
  from public.demo_calls
  where created_at > now() - interval '2 minutes';
  if v_recent >= 1 then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited');
  end if;

  insert into public.demo_calls (ip_hash, destination_masked, region, status)
  values (p_ip_hash, p_destination_masked, p_region, 'reserved')
  returning id into v_id;

  return jsonb_build_object('allowed', true, 'call_id', v_id, 'remaining', p_budget - v_total - 1);
end;
$$;

-- ── Finalize a reserved row after the call is placed / completes ──────────────
create or replace function public.finalize_demo_call(
  p_id uuid,
  p_status text,
  p_calle_call_id text,
  p_outcome text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.demo_calls
  set status = p_status, calle_call_id = p_calle_call_id, outcome = p_outcome
  where id = p_id;
end;
$$;

-- ── Read remaining budget for the UI (never exposes rows) ─────────────────────
create or replace function public.demo_call_budget(p_budget int)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', p_budget,
    'used', (select count(*)::int from public.demo_calls),
    'remaining', greatest(0, p_budget - (select count(*)::int from public.demo_calls))
  );
$$;

-- Only the server-side service-role may execute these. Never anon/authenticated.
revoke all on function public.reserve_demo_call(text, text, text, int) from public, anon, authenticated;
revoke all on function public.finalize_demo_call(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.demo_call_budget(int) from public, anon, authenticated;
grant execute on function public.reserve_demo_call(text, text, text, int) to service_role;
grant execute on function public.finalize_demo_call(uuid, text, text, text) to service_role;
grant execute on function public.demo_call_budget(int) to service_role;
