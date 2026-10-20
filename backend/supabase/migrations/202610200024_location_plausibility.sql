create table public.suspicious_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null,
  reason text not null check (reason in ('IMPLAUSIBLE_SPEED', 'OUTSIDE_ZONE_RANGE', 'INVALID_FIX_TIME')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (match_id, player_id) references public.players(match_id, id) on delete cascade
);
create index suspicious_events_match_time_idx on public.suspicious_events(match_id, created_at desc);
alter table public.suspicious_events enable row level security;
revoke all on public.suspicious_events from public, anon, authenticated;

create or replace function public.xzones_update_location(
  p_auth_user_id uuid, p_match_id uuid, p_lat double precision, p_lon double precision,
  p_accuracy_m real, p_captured_at timestamptz, p_sequence bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player_id uuid;
  v_now timestamptz := clock_timestamp();
  v_last_fix public.latest_fix%rowtype;
  v_effective_captured_at timestamptz;
  v_zone jsonb;
  v_center jsonb;
  v_zone_distance double precision;
  v_movement double precision;
  v_elapsed double precision;
begin
  if p_lat is null or p_lat not between -90 and 90 or p_lon is null or p_lon not between -180 and 180
    or p_accuracy_m is null or p_accuracy_m < 0 or p_accuracy_m > 10000
    or p_captured_at is null
    or p_sequence is null or p_sequence < 0 then
    return jsonb_build_object('error', 'INVALID_FIX');
  end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state not in ('HEAD_START', 'ACTIVE') then return jsonb_build_object('error', 'INACTIVE'); end if;
  if v_match.ends_at is not null and v_now >= v_match.ends_at then return jsonb_build_object('error', 'DEADLINE_PASSED'); end if;
  select id into v_player_id from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE' and role is not null;
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;
  if p_captured_at > v_now + interval '30 seconds' or p_captured_at < v_now - interval '60 seconds' then
    insert into public.suspicious_events(match_id, player_id, reason)
      values (p_match_id, v_player_id, 'INVALID_FIX_TIME');
    return jsonb_build_object('error', 'INVALID_FIX');
  end if;
  select * into v_last_fix from public.latest_fix where match_id = p_match_id and player_id = v_player_id for update;
  if v_last_fix.player_id is not null and p_sequence <= v_last_fix.sequence then
    return jsonb_build_object('error', 'OLD_SEQUENCE', 'last_sequence', v_last_fix.sequence);
  end if;
  if p_accuracy_m > 100 then return jsonb_build_object('accepted', false, 'stale', true, 'reason', 'POOR_ACCURACY', 'server_now', v_now); end if;
  if v_last_fix.player_id is not null then
    v_elapsed := extract(epoch from (p_captured_at - v_last_fix.captured_at));
    v_movement := 6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat - v_last_fix.lat) / 2), 2)
      + cos(radians(v_last_fix.lat)) * cos(radians(p_lat))
      * power(sin(radians(p_lon - v_last_fix.lon) / 2), 2)
    ));
    if v_elapsed <= 0 or v_movement / v_elapsed > 15 then
      insert into public.suspicious_events(match_id, player_id, reason)
        values (p_match_id, v_player_id, 'IMPLAUSIBLE_SPEED');
      return jsonb_build_object('accepted', false, 'stale', false, 'reason', 'IMPLAUSIBLE_MOVEMENT', 'server_now', v_now);
    end if;
  end if;
  v_zone := public.xzones_zone_at(p_match_id, v_now);
  if coalesce((v_zone->>'enabled')::boolean, false) then
    v_center := v_zone->'center';
    v_zone_distance := 6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat - (v_center->>'lat')::double precision) / 2), 2)
      + cos(radians((v_center->>'lat')::double precision)) * cos(radians(p_lat))
      * power(sin(radians(p_lon - (v_center->>'lon')::double precision) / 2), 2)
    ));
    if v_zone_distance > 10000 then
      insert into public.suspicious_events(match_id, player_id, reason)
        values (p_match_id, v_player_id, 'OUTSIDE_ZONE_RANGE');
      return jsonb_build_object('accepted', false, 'stale', false, 'reason', 'OUTSIDE_ZONE_RANGE', 'server_now', v_now);
    end if;
  end if;
  if v_last_fix.received_at is not null and v_last_fix.received_at > v_now - interval '2 seconds' then
    return jsonb_build_object('error', 'RATE_LIMITED', 'retry_after_seconds', 2);
  end if;
  v_effective_captured_at := p_captured_at;
  insert into public.latest_fix(match_id, player_id, lat, lon, accuracy_m, captured_at, received_at, sequence)
    values (p_match_id, v_player_id, p_lat, p_lon, p_accuracy_m, v_effective_captured_at, v_now, p_sequence)
  on conflict (player_id) do update set match_id = excluded.match_id, lat = excluded.lat, lon = excluded.lon,
    accuracy_m = excluded.accuracy_m, captured_at = excluded.captured_at, received_at = excluded.received_at,
    sequence = excluded.sequence
  where public.latest_fix.match_id = excluded.match_id and public.latest_fix.sequence < excluded.sequence;
  if not found then return jsonb_build_object('error', 'OLD_SEQUENCE'); end if;
  return jsonb_build_object('accepted', true, 'stale', false, 'player_id', v_player_id, 'server_now', v_now);
end;
$$;

create or replace function public.xzones_host_suspicious_events(p_auth_user_id uuid, p_match_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select case when exists (
    select 1 from public.matches m join public.players host on host.id = m.host_player_id
    where m.id = p_match_id and host.auth_user_id = p_auth_user_id
  ) then coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'player_id', e.player_id,
      'display_name', p.display_name, 'reason', e.reason, 'created_at', e.created_at) order by e.created_at desc)
    from public.suspicious_events e join public.players p on p.id = e.player_id and p.match_id = e.match_id
    where e.match_id = p_match_id
  ), '[]'::jsonb) else '[]'::jsonb end
$$;

revoke all on function public.xzones_update_location(uuid, uuid, double precision, double precision, real, timestamptz, bigint) from public, anon, authenticated;
revoke all on function public.xzones_host_suspicious_events(uuid, uuid) from public, anon, authenticated;
grant execute on function public.xzones_update_location(uuid, uuid, double precision, double precision, real, timestamptz, bigint) to service_role;
grant execute on function public.xzones_host_suspicious_events(uuid, uuid) to service_role;
