begin;
do $$
declare
  v_host_auth uuid := gen_random_uuid();
  v_hunter_b_auth uuid := gen_random_uuid();
  v_runner_a_auth uuid := gen_random_uuid();
  v_runner_b_auth uuid := gen_random_uuid();
  v_runner_c_auth uuid := gen_random_uuid();
  v_match_host uuid := gen_random_uuid();
  v_match_hunters uuid := gen_random_uuid();
  v_match_timer uuid := gen_random_uuid();
  v_match_stale_host uuid := gen_random_uuid();
  v_host uuid;
  v_hunter_b uuid;
  v_runner_a uuid;
  v_runner_b uuid;
  v_runner_c uuid;
  v_hunter_one uuid;
  v_hunter_two uuid;
  v_timer_hunter uuid;
  v_timer_runner uuid;
  v_stale_host uuid;
  v_stale_hunter uuid;
  v_stale_runner uuid;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  insert into auth.users(id) values (v_host_auth), (v_hunter_b_auth), (v_runner_a_auth), (v_runner_b_auth), (v_runner_c_auth);
  insert into public.matches(id, code_hash, state, round_seconds, head_start_seconds, ping_seconds,
    started_at, head_start_ends_at, ends_at, expires_at)
  values
    (v_match_host, decode(repeat('a', 64), 'hex'), 'ACTIVE', 2700, 0, 300, v_now - interval '5 minutes', v_now - interval '5 minutes', v_now + interval '40 minutes', v_now + interval '1 day'),
    (v_match_hunters, decode(repeat('b', 64), 'hex'), 'ACTIVE', 2700, 0, 300, v_now - interval '5 minutes', v_now - interval '5 minutes', v_now + interval '40 minutes', v_now + interval '1 day'),
    (v_match_timer, decode(repeat('c', 64), 'hex'), 'ACTIVE', 600, 0, 300, v_now - interval '11 minutes', v_now - interval '11 minutes', v_now - interval '1 minute', v_now + interval '1 day'),
    (v_match_stale_host, decode(repeat('e', 64), 'hex'), 'ACTIVE', 2700, 0, 300, v_now - interval '10 minutes', v_now - interval '10 minutes', v_now + interval '35 minutes', v_now + interval '1 day');

  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match_host, v_host_auth, 'Host', 'HUNTER', decode(repeat('1', 64), 'hex')) returning id into v_host;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match_host, v_hunter_b_auth, 'Hunter B', 'HUNTER', decode(repeat('2', 64), 'hex')) returning id into v_hunter_b;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match_host, v_runner_a_auth, 'Runner A', 'RUNNER', decode(repeat('3', 64), 'hex')) returning id into v_runner_a;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match_host, v_runner_b_auth, 'Runner B', 'RUNNER', decode(repeat('4', 64), 'hex')) returning id into v_runner_b;
  update public.matches set host_player_id = v_host, controller_player_id = v_host where id = v_match_host;

  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match_hunters, v_host_auth, 'Hunter One', 'HUNTER', decode(repeat('5', 64), 'hex')) returning id into v_hunter_one;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match_hunters, v_hunter_b_auth, 'Hunter Two', 'HUNTER', decode(repeat('6', 64), 'hex')) returning id into v_hunter_two;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match_hunters, v_runner_c_auth, 'Runner C', 'RUNNER', decode(repeat('7', 64), 'hex')) returning id into v_runner_c;
  update public.matches set host_player_id = v_hunter_one, controller_player_id = v_hunter_one where id = v_match_hunters;

  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match_timer, v_host_auth, 'Timer Hunter', 'HUNTER', decode(repeat('8', 64), 'hex')) returning id into v_timer_hunter;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match_timer, v_runner_c_auth, 'Timer Runner', 'RUNNER', decode(repeat('9', 64), 'hex')) returning id into v_timer_runner;
  update public.matches set host_player_id = v_timer_hunter, controller_player_id = v_timer_hunter where id = v_match_timer;

  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash, last_seen_at)
    values (v_match_stale_host, v_host_auth, 'Stale Host', 'HUNTER', decode(repeat('a1', 32), 'hex'), v_now - interval '2 minutes') returning id into v_stale_host;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match_stale_host, v_hunter_b_auth, 'Available Hunter', 'HUNTER', decode(repeat('a2', 32), 'hex')) returning id into v_stale_hunter;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match_stale_host, v_runner_a_auth, 'Stale Runner', 'RUNNER', decode(repeat('a3', 32), 'hex')) returning id into v_stale_runner;
  update public.matches set host_player_id = v_stale_host, controller_player_id = v_stale_host where id = v_match_stale_host;
  update public.players set last_seen_at = v_now - interval '2 minutes' where id = v_stale_host;

  insert into public.latest_fix(match_id, player_id, lat, lon, accuracy_m, captured_at, sequence)
    values (v_match_host, v_runner_a, 25.61, 85.14, 8, v_now, 1),
      (v_match_hunters, v_runner_c, 25.62, 85.15, 8, v_now, 1),
      (v_match_timer, v_timer_runner, 25.63, 85.16, 8, v_now - interval '11 minutes', 1);

  -- The host's explicit departure opens the claim window immediately.
  v_result := public.xzones_leave_match(v_host_auth, v_match_host);
  if (v_result->>'accepted')::boolean is not true or v_result->>'claim_expires_at' is null then
    raise exception 'host leave should return an immediate claim window: %', v_result;
  end if;
  if (select controller_player_id is not null from public.matches where id = v_match_host) then
    raise exception 'departing host control must be cleared';
  end if;
  v_result := public.xzones_claim_controller(v_hunter_b_auth, v_match_host);
  if (v_result->>'accepted')::boolean is not true then raise exception 'active member should claim: %', v_result; end if;
  v_result := public.xzones_end_match(v_hunter_b_auth, v_match_host, 'HOST_END');
  if v_result->>'error' is not null then raise exception 'new controller should end match: %', v_result; end if;
  if not exists (select 1 from public.match_results where match_id = v_match_host and end_reason = 'HOST_END' and winner is null) then
    raise exception 'host end must persist a no-winner result';
  end if;
  if exists (select 1 from public.latest_fix where match_id = v_match_host) then raise exception 'end must delete latest fixes'; end if;

  -- The second Hunter leaving gives active Runners the win.
  perform public.xzones_leave_match(v_host_auth, v_match_hunters);
  v_result := public.xzones_leave_match(v_hunter_b_auth, v_match_hunters);
  if v_result->>'state' <> 'ENDED' then raise exception 'all Hunters leaving must end the match: %', v_result; end if;
  if not exists (select 1 from public.match_results where match_id = v_match_hunters and winner = 'RUNNER' and end_reason = 'ALL_HUNTERS_LEFT') then
    raise exception 'Runners must win after all Hunters leave';
  end if;
  if exists (select 1 from public.latest_fix where match_id = v_match_hunters) then raise exception 'Hunter-empty result must delete fixes'; end if;

  -- At the server deadline active Runners win and all locations are removed.
  v_result := public.xzones_resolve_match(v_runner_c_auth, v_match_timer);
  if v_result->>'state' <> 'ENDED' or v_result->>'winner' <> 'RUNNER' then
    raise exception 'timer deadline should award Runners: %', v_result;
  end if;
  if not exists (select 1 from public.match_results where match_id = v_match_timer and end_reason = 'TIME_EXPIRED') then
    raise exception 'timer outcome should be persisted';
  end if;
  if exists (select 1 from public.latest_fix where match_id = v_match_timer) then raise exception 'timer outcome must delete fixes'; end if;
  v_result := public.xzones_match_result(v_runner_c_auth, v_match_timer);
  if (v_result->>'duration_seconds')::integer <> 600 or (v_result->>'tag_count')::integer <> 0 then
    raise exception 'result must contain safe duration and tag count: %', v_result;
  end if;

  v_result := public.xzones_resolve_match(v_hunter_b_auth, v_match_stale_host);
  if (v_result->>'state') <> 'ACTIVE' or not (public.xzones_match_controls(v_hunter_b_auth, v_match_stale_host)->>'can_claim')::boolean then
    raise exception 'stale host heartbeat should open claim controls: %', v_result;
  end if;
  update public.matches set claim_expires_at = v_now - interval '1 second' where id = v_match_stale_host;
  v_result := public.xzones_resolve_match(v_runner_a_auth, v_match_stale_host);
  if v_result->>'state' <> 'ENDED' or v_result->>'winner' is not null or v_result->>'end_reason' <> 'HOST_LOST' then
    raise exception 'unclaimed host loss should end without a winner: %', v_result;
  end if;

  update public.match_results set cleanup_after = v_now - interval '1 second' where match_id = v_match_timer;
  insert into public.ping_snapshots(match_id, runner_id, ping_index, status, lat, lon, accuracy_m, captured_at, ping_at, age_seconds)
    values (v_match_timer, v_timer_runner, 1, 'STALE', null, null, null, null, v_now - interval '8 days', 700000);
  insert into public.qr_challenges(match_id, runner_id, token_hash, expires_at)
    values (v_match_timer, v_timer_runner, decode(repeat('a4', 32), 'hex'), v_now - interval '1 second');
  insert into public.rate_limits(bucket_key, action, window_started_at, attempts, expires_at)
    values (decode(repeat('d', 64), 'hex'), 'test-cleanup', v_now - interval '1 hour', 1, v_now - interval '1 second');
  v_result := public.xzones_cleanup(v_now);
  if (v_result->>'deleted_matches')::integer <> 1 or (v_result->>'deleted_rate_limits')::integer <> 1
    or (v_result->>'deleted_snapshots')::integer <> 1 or (v_result->>'deleted_challenges')::integer <> 1 then
    raise exception 'cleanup must remove expired results, limits, snapshots and challenges: %', v_result;
  end if;
  if exists (select 1 from public.matches where id = v_match_timer) then raise exception 'expired match metadata must be deleted'; end if;
end;
$$;
rollback;
