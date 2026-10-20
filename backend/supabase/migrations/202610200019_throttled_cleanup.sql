create table if not exists public.xzones_cleanup_state (
  singleton boolean primary key default true check (singleton),
  last_cleanup_at timestamptz
);

revoke all on public.xzones_cleanup_state from public, anon, authenticated, service_role;

insert into public.xzones_cleanup_state(singleton, last_cleanup_at)
values (true, null)
on conflict (singleton) do nothing;

create or replace function public.xzones_cleanup(p_now timestamptz default clock_timestamp())
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_challenges integer;
  v_limits integer;
  v_snapshots integer;
  v_matches integer;
  v_last_cleanup timestamptz;
begin
  if not pg_try_advisory_xact_lock(812034771920601) then
    return jsonb_build_object('skipped', true, 'reason', 'LOCKED');
  end if;

  select last_cleanup_at into v_last_cleanup
    from public.xzones_cleanup_state where singleton for update;
  if v_last_cleanup is not null and v_last_cleanup > p_now - interval '60 seconds' then
    return jsonb_build_object('skipped', true, 'reason', 'THROTTLED');
  end if;

  update public.xzones_cleanup_state set last_cleanup_at = p_now where singleton;
  delete from public.qr_challenges where expires_at <= p_now or created_at <= p_now - interval '7 days';
  get diagnostics v_challenges = row_count;
  delete from public.rate_limits where expires_at <= p_now;
  get diagnostics v_limits = row_count;
  delete from public.ping_snapshots where ping_at <= p_now - interval '7 days';
  get diagnostics v_snapshots = row_count;
  delete from public.matches m
    where (m.state in ('ENDED', 'CANCELLED') and exists (
      select 1 from public.match_results r where r.match_id = m.id and r.cleanup_after <= p_now
    )) or (m.state = 'LOBBY' and m.expires_at <= p_now);
  get diagnostics v_matches = row_count;
  return jsonb_build_object('skipped', false, 'deleted_challenges', v_challenges, 'deleted_rate_limits', v_limits,
    'deleted_snapshots', v_snapshots, 'deleted_matches', v_matches);
end;
$$;

revoke all on function public.xzones_cleanup(timestamptz) from public, anon, authenticated;
grant execute on function public.xzones_cleanup(timestamptz) to service_role;
