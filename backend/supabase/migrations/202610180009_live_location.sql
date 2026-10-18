create or replace function public.xzones_update_location(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_lat double precision,
  p_lon double precision,
  p_accuracy_m real,
  p_captured_at timestamptz,
  p_sequence bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player_id uuid;
  v_now timestamptz := clock_timestamp();
  v_last_sequence bigint;
  v_last_received_at timestamptz;
  v_effective_captured_at timestamptz;
begin
  if p_lat is null or p_lat not between -90 and 90 or p_lon is null or p_lon not between -180 and 180
    or p_accuracy_m is null or p_accuracy_m < 0 or p_accuracy_m > 10000
    or p_captured_at is null or p_captured_at > v_now + interval '30 seconds'
    or p_sequence is null or p_sequence < 0 then
    return jsonb_build_object('error', 'INVALID_FIX');
  end if;
  select * into v_match from public.matches where id = p_match_id;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state not in ('HEAD_START', 'ACTIVE') then return jsonb_build_object('error', 'INACTIVE'); end if;
  if v_match.ends_at is not null and v_now >= v_match.ends_at then return jsonb_build_object('error', 'DEADLINE_PASSED'); end if;
  select id into v_player_id from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE' and role is not null;
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;

  v_effective_captured_at := least(v_now, greatest(v_now - interval '60 seconds', p_captured_at));
  select sequence, received_at into v_last_sequence, v_last_received_at
    from public.latest_fix where match_id = p_match_id and player_id = v_player_id for update;
  if v_last_sequence is not null and p_sequence <= v_last_sequence then
    return jsonb_build_object('error', 'OLD_SEQUENCE', 'last_sequence', v_last_sequence);
  end if;
  if p_accuracy_m > 100 then
    return jsonb_build_object('accepted', false, 'stale', true, 'reason', 'POOR_ACCURACY', 'server_now', v_now);
  end if;
  if v_last_received_at is not null and v_last_received_at > v_now - interval '2 seconds' then
    return jsonb_build_object('error', 'RATE_LIMITED', 'retry_after_seconds', 2);
  end if;

  insert into public.latest_fix(match_id, player_id, lat, lon, accuracy_m, captured_at, received_at, sequence)
    values (p_match_id, v_player_id, p_lat, p_lon, p_accuracy_m, v_effective_captured_at, v_now, p_sequence)
  on conflict (player_id) do update set
    match_id = excluded.match_id, lat = excluded.lat, lon = excluded.lon, accuracy_m = excluded.accuracy_m,
    captured_at = excluded.captured_at, received_at = excluded.received_at, sequence = excluded.sequence
  where public.latest_fix.match_id = excluded.match_id and public.latest_fix.sequence < excluded.sequence;

  if not found then return jsonb_build_object('error', 'OLD_SEQUENCE', 'last_sequence', v_last_sequence); end if;
  return jsonb_build_object('accepted', true, 'stale', false, 'player_id', v_player_id, 'server_now', v_now);
end;
$$;

create or replace function public.xzones_team_positions(p_auth_user_id uuid, p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player_id uuid;
  v_role public.player_role;
  v_now timestamptz := clock_timestamp();
  v_positions jsonb;
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  select id, role into v_player_id, v_role from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE';
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;
  if v_role is null then return jsonb_build_object('error', 'TEAM_NOT_SELECTED'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', p.id, 'display_name', p.display_name, 'team_role', p.role, 'lat', f.lat, 'lon', f.lon,
    'accuracy_m', f.accuracy_m, 'captured_at', f.captured_at,
    'age_seconds', greatest(0, floor(extract(epoch from (v_now - f.captured_at))))::integer,
    'is_stale', f.captured_at < v_now - interval '30 seconds'
  ) order by p.id), '[]'::jsonb)
  into v_positions
  from public.players p join public.latest_fix f on f.match_id = p.match_id and f.player_id = p.id
  where p.match_id = p_match_id and p.role = v_role and p.status = 'ACTIVE'
    and v_match.state in ('HEAD_START', 'ACTIVE');
  return jsonb_build_object('role', v_role, 'own_player_id', v_player_id, 'positions', v_positions, 'server_now', v_now);
end;
$$;

revoke all on function public.xzones_update_location(uuid, uuid, double precision, double precision, real, timestamptz, bigint) from public, anon, authenticated;
revoke all on function public.xzones_team_positions(uuid, uuid) from public, anon, authenticated;
grant execute on function public.xzones_update_location(uuid, uuid, double precision, double precision, real, timestamptz, bigint) to service_role;
grant execute on function public.xzones_team_positions(uuid, uuid) to service_role;
