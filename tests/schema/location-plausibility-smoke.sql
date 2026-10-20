begin;

do $$
declare
  v_host uuid := gen_random_uuid();
  v_runner uuid := gen_random_uuid();
  v_far_runner uuid := gen_random_uuid();
  v_match uuid := gen_random_uuid();
  v_start timestamptz := clock_timestamp();
  v_result jsonb;
  v_events jsonb;
begin
  insert into auth.users(id) values (v_host), (v_runner), (v_far_runner);
  insert into public.matches (id, code_hash, state, round_seconds, head_start_seconds, zone_lat, zone_lon,
    zone_radius_m, started_at, head_start_ends_at, expires_at)
  values (v_match, decode(repeat('b', 64), 'hex'), 'ACTIVE', 1800, 0, 0, 0, 500,
    v_start, v_start, v_start + interval '2 hours');
  insert into public.players (id, match_id, auth_user_id, display_name, role, session_cap_hash)
  values (v_host, v_match, v_host, 'Host', 'HUNTER', decode(repeat('c', 64), 'hex')),
    (v_runner, v_match, v_runner, 'Fast Runner', 'RUNNER', decode(repeat('d', 64), 'hex')),
    (v_far_runner, v_match, v_far_runner, 'Far Runner', 'RUNNER', decode(repeat('e', 64), 'hex'));
  update public.matches set host_player_id = v_host, controller_player_id = v_host where id = v_match;

  insert into public.latest_fix (match_id, player_id, lat, lon, accuracy_m, captured_at, received_at, sequence)
  values (v_match, v_runner, 0, 0, 5, v_start, v_start, 1);
  v_result := public.xzones_update_location(v_runner, v_match, 0.001, 0, 5, clock_timestamp(), 2);
  if v_result->>'reason' <> 'IMPLAUSIBLE_MOVEMENT' then raise exception 'fast jump should be rejected: %', v_result; end if;
  v_result := public.xzones_update_location(v_far_runner, v_match, 0.2, 0, 5, clock_timestamp(), 1);
  if v_result->>'reason' <> 'OUTSIDE_ZONE_RANGE' then raise exception 'fix beyond 10km from zone should be rejected: %', v_result; end if;
  v_result := public.xzones_update_location(v_far_runner, v_match, 0, 0, 5, clock_timestamp() - interval '61 seconds', 2);
  if v_result->>'error' <> 'INVALID_FIX' then raise exception 'stale fix beyond timestamp clamp should be rejected: %', v_result; end if;
  v_events := public.xzones_host_suspicious_events(v_host, v_match)->'events';
  if jsonb_array_length(v_events) <> 3 then raise exception 'host should see all three logged suspicious events: %', v_events; end if;
  if public.xzones_host_suspicious_events(v_runner, v_match)->'events' <> '[]'::jsonb then
    raise exception 'non-host must not see suspicious events';
  end if;
end;
$$;

rollback;
