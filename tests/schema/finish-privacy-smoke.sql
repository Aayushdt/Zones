begin;
do $$
declare
  v_host_auth uuid := gen_random_uuid();
  v_runner_auth uuid := gen_random_uuid();
  v_match uuid := gen_random_uuid();
  v_host uuid;
  v_runner uuid;
  v_result jsonb;
begin
  insert into auth.users(id) values (v_host_auth), (v_runner_auth);
  insert into public.matches(id, code_hash, state, round_seconds, head_start_seconds, ping_seconds,
    started_at, head_start_ends_at, ends_at, expires_at)
  values (v_match, decode(repeat('a', 64), 'hex'), 'ACTIVE', 2700, 0, 300,
    clock_timestamp() - interval '5 minutes', clock_timestamp() - interval '5 minutes',
    clock_timestamp() + interval '40 minutes', clock_timestamp() + interval '1 day');
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match, v_host_auth, 'Privacy Host', 'HUNTER', decode(repeat('a1', 32), 'hex')) returning id into v_host;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash,
    stationary_anchor_lat, stationary_anchor_lon, stationary_since)
    values (v_match, v_runner_auth, 'Privacy Runner', 'RUNNER', decode(repeat('a2', 32), 'hex'), 25.6, 85.1, clock_timestamp()) returning id into v_runner;
  update public.matches set host_player_id = v_host, controller_player_id = v_host where id = v_match;
  insert into public.latest_fix(match_id, player_id, lat, lon, accuracy_m, captured_at, sequence)
    values (v_match, v_runner, 25.6, 85.1, 5, clock_timestamp(), 1);
  insert into public.ping_snapshots(match_id, runner_id, ping_index, status, lat, lon, accuracy_m,
    captured_at, ping_at, age_seconds)
    values (v_match, v_runner, 0, 'OK', 25.6, 85.1, 5, clock_timestamp(), clock_timestamp(), 0);

  v_result := public.xzones_finish_match(v_match, 'RUNNER', 'TIME_LIMIT');
  if v_result->>'state' <> 'ENDED' then raise exception 'match should finish: %', v_result; end if;
  if exists (select 1 from public.latest_fix where match_id = v_match)
    or exists (select 1 from public.ping_snapshots where match_id = v_match)
    or exists (select 1 from public.players where match_id = v_match
      and (stationary_anchor_lat is not null or stationary_anchor_lon is not null)) then
    raise exception 'finished match retained player coordinates or ping snapshots';
  end if;
  perform public.xzones_finish_match(v_match, 'RUNNER', 'TIME_LIMIT');
  if exists (select 1 from public.ping_snapshots where match_id = v_match) then
    raise exception 'idempotent finish must preserve coordinate purge';
  end if;
end;
$$;
rollback;
