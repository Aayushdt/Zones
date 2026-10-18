begin;
do $$
declare
  v_hunter_auth uuid := gen_random_uuid();
  v_runner_auth uuid := gen_random_uuid();
  v_other_runner_auth uuid := gen_random_uuid();
  v_match uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_hunter uuid;
  v_runner uuid;
  v_other_runner uuid;
  v_result jsonb;
  v_team jsonb;
begin
  insert into auth.users(id) values (v_hunter_auth), (v_runner_auth), (v_other_runner_auth);
  insert into public.matches(id, code_hash, state, round_seconds, head_start_seconds, ping_seconds,
    started_at, head_start_ends_at, ends_at, expires_at)
  values (v_match, decode(repeat('f', 64), 'hex'), 'ACTIVE', 2700, 0, 300,
    v_now - interval '1 minute', v_now - interval '1 minute', v_now + interval '44 minutes', v_now + interval '1 day');
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match, v_hunter_auth, 'Hunter', 'HUNTER', decode(repeat('1', 64), 'hex')) returning id into v_hunter;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match, v_runner_auth, 'Runner', 'RUNNER', decode(repeat('2', 64), 'hex')) returning id into v_runner;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match, v_other_runner_auth, 'Runner Teammate', 'RUNNER', decode(repeat('3', 64), 'hex')) returning id into v_other_runner;

  v_result := public.xzones_update_location(v_runner_auth, v_match, 25.6101, 85.1401, 8, v_now, 100);
  if (v_result->>'accepted')::boolean is not true or v_result->>'player_id' <> v_runner::text then
    raise exception 'valid location should be accepted without echoing the fix: %', v_result;
  end if;
  if v_result ? 'lat' or v_result ? 'lon' then raise exception 'location acknowledgement must not echo coordinates'; end if;
  if not exists (select 1 from public.latest_fix where player_id = v_runner
    and captured_at <= received_at and captured_at >= received_at - interval '60 seconds') then
    raise exception 'stored fix timestamp must be clamped to a server-derived 0-60 second age';
  end if;

  v_result := public.xzones_update_location(v_runner_auth, v_match, 25.6201, 85.1501, 8, v_now, 100);
  if v_result->>'error' <> 'OLD_SEQUENCE' then raise exception 'duplicate sequence must be rejected: %', v_result; end if;
  v_result := public.xzones_update_location(v_runner_auth, v_match, 25.6201, 85.1501, 101, v_now, 101);
  if (v_result->>'accepted')::boolean is not false or v_result->>'reason' <> 'POOR_ACCURACY' then
    raise exception 'poor fix should be rejected without storing: %', v_result;
  end if;
  if (select sequence from public.latest_fix where player_id = v_runner) <> 100 then
    raise exception 'poor fix must not replace the most recent valid fix';
  end if;

  v_result := public.xzones_update_location(v_runner_auth, v_match, 25.6201, 85.1501, 8, v_now, 101);
  if v_result->>'error' <> 'RATE_LIMITED' then
    raise exception 'fix upload within two seconds must be throttled: %', v_result;
  end if;

  v_result := public.xzones_team_positions(v_runner_auth, v_match);
  if v_result->>'role' <> 'RUNNER' or v_result->>'own_player_id' <> v_runner::text then
    raise exception 'Runner team view must identify its own role/member';
  end if;
  if (select count(*) from jsonb_array_elements(v_result->'positions')) <> 1
    or v_result->'positions'->0->>'player_id' <> v_runner::text then
    raise exception 'Runner view should contain their own fix only: %', v_result;
  end if;
  v_result := public.xzones_team_positions(v_hunter_auth, v_match);
  if jsonb_array_length(v_result->'positions') <> 0 then raise exception 'Hunter view must not contain Runner locations'; end if;

  v_result := public.xzones_update_location(v_hunter_auth, v_match, 25.6001, 85.1301, 5, v_now, 200);
  if (v_result->>'accepted')::boolean is not true then raise exception 'Hunter location should be accepted'; end if;
  v_result := public.xzones_team_positions(v_hunter_auth, v_match);
  if jsonb_array_length(v_result->'positions') <> 1
    or v_result->'positions'->0->>'player_id' <> v_hunter::text then
    raise exception 'Hunter should see Hunter teammate positions only: %', v_result;
  end if;
  if jsonb_path_exists(v_result->'positions', '$[*] ? (@.team_role == "RUNNER")') then
    raise exception 'Hunter position payload included a Runner role';
  end if;

  update public.latest_fix set captured_at = v_now - interval '31 seconds' where player_id = v_runner;
  v_result := public.xzones_team_positions(v_runner_auth, v_match);
  if (v_result->'positions'->0->>'is_stale')::boolean is not true
    or (v_result->'positions'->0->>'age_seconds')::integer < 30 then
    raise exception 'team positions must label fixes stale after 30 seconds: %', v_result;
  end if;
end;
$$;
rollback;
