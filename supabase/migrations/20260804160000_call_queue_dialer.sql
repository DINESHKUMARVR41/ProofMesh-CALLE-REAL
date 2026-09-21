-- Phase F: the dialer's data-layer support.
--
-- Two new columns and one atomic claim function. The claim is where "one call at a
-- time" and "two dialers place exactly one call" are guaranteed — in the database,
-- under an advisory lock, not in application code.

alter table public.call_queue
  add column dialed_at timestamptz,          -- when the dialer last started dialing it
  add column attempts  integer not null default 0;

-- ────────────────────────────────────────────────
-- claim_next_call: atomically pick and lease ONE approved entry to dial.
--
-- Guarantees, all under a single advisory lock so concurrent dialer ticks serialize:
--   * Concurrency = 1 — never returns a row while any entry is already 'dialing'
--     (CALL-E's default number allows one call at a time).
--   * Stale-lease recovery — an entry stuck 'dialing' past p_stale_minutes (a dialer
--     that crashed mid-call) is released back to 'approved' to be retried.
--   * Per-destination cap — skips an entry whose to_phone has already been dialed
--     p_dest_cap times in the last 24h (the B1 backstop against one client being
--     dialed repeatedly across days).
--   * Calling hours — only claims entries whose to_region is in p_allowed_regions
--     (the caller passes the regions currently inside their local calling window).
--
-- Returns the leased row (now 'dialing', attempts incremented) or NULL.
-- ────────────────────────────────────────────────
create or replace function public.claim_next_call(
  p_allowed_regions text[],
  p_now             timestamptz,
  p_dest_cap        integer,
  p_stale_minutes   integer
) returns public.call_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.call_queue;
begin
  perform pg_advisory_xact_lock(hashtext('call_queue_dialer'));

  -- Release crashed leases (attempts was already incremented when first claimed).
  update public.call_queue
    set status = 'approved'
    where status = 'dialing'
      and dialed_at is not null
      and dialed_at < p_now - make_interval(mins => p_stale_minutes);

  -- Concurrency = 1: a call is already in flight, do not start another.
  if exists (select 1 from public.call_queue where status = 'dialing') then
    return null;
  end if;

  select q.* into v_row
  from public.call_queue q
  where q.status = 'approved'
    and q.scheduled_for <= p_now
    and q.to_region = any (p_allowed_regions)
    and (
      select count(*) from public.call_queue c
      where c.to_phone = q.to_phone
        and c.status in ('dialing', 'completed')
        and c.dialed_at is not null
        and c.dialed_at > p_now - interval '24 hours'
    ) < p_dest_cap
  order by q.scheduled_for asc
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.call_queue
    set status = 'dialing', dialed_at = p_now, attempts = attempts + 1
    where id = v_row.id
    returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.claim_next_call(text[], timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_next_call(text[], timestamptz, integer, integer) to service_role;
