begin;

do $$
declare
  v_hunter uuid := gen_random_uuid();
  v_hunter_two uuid := gen_random_uuid();
  v_runner_near uuid := gen_random_uuid();
  v_runner_far uuid := gen_random_uuid();
  v_match uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  insert into auth.users(id) values (v_hunter), (v_hunter_two), (v_runner_near), (v_runner_far);
  insert into public.matches (id, code_hash, state, round_seconds, head_start_seconds, started_at,
    head_start_ends_at, expires_at)
  values (v_match, decode(repeat('7', 64), 'hex'), 'ACTIVE', 1800, 0,
    v_now - interval '1 minute', v_now - interval '1 minute', v_now + interval '2 hours');
  insert into public.players (id, match_id, auth_user_id, display_name, role, session_cap_hash)
  values (v_hunter, v_match, v_hunter, 'Hunter One', 'HUNTER', decode(repeat('1', 64), 'hex')),
    (v_hunter_two, v_match, v_hunter_two, 'Hunter Two', 'HUNTER', decode(repeat('2', 64), 'hex')),
    (v_runner_near, v_match, v_runner_near, 'Near Runner', 'RUNNER', decode(repeat('3', 64), 'hex')),
    (v_runner_far, v_match, v_runner_far, 'Far Runner', 'RUNNER', decode(repeat('4', 64), 'hex'));
  insert into public.latest_fix (match_id, player_id, lat, lon, accuracy_m, captured_at, received_at, sequence)
  values (v_match, v_runner_near, 0.0001, 0, 5, v_now, v_now, 1),
    (v_match, v_runner_far, 0.0005, 0, 5, v_now, v_now, 1);

  v_result := public.xzones_gps_tag(v_hunter, v_match, decode(repeat('a', 64), 'hex'), 0, 0, 5, v_now);
  if v_result->>'accepted' <> 'true' or v_result->'runner_id' is not null or v_result->'distance' is not null then
    raise exception 'valid nearest GPS tag should be accepted without returning identity/distance: %', v_result;
  end if;
  if not exists (select 1 from public.tags where match_id = v_match and runner_id = v_runner_near and method = 'GPS') then
    raise exception 'nearest eligible Runner was not recorded as GPS-tagged';
  end if;
  v_result := public.xzones_gps_tag(v_hunter_two, v_match, decode(repeat('b', 64), 'hex'), 0, 0, 5, clock_timestamp());
  if v_result->>'reason' <> 'NOTHING_IN_RANGE' or v_result->'runner_id' is not null or v_result->'distance' is not null then
    raise exception 'miss must be generic and disclose no candidate: %', v_result;
  end if;
  v_result := public.xzones_gps_tag(v_hunter, v_match, decode(repeat('a', 64), 'hex'), 0, 0, 5, clock_timestamp());
  if v_result->>'error' <> 'RATE_LIMITED' then raise exception 'Hunter tag attempts must be rate-limited: %', v_result; end if;
end;
$$;

rollback;
