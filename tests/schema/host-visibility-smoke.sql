begin;
do $$
declare
  v_host_auth uuid := gen_random_uuid();
  v_hunter_auth uuid := gen_random_uuid();
  v_runner_auth uuid := gen_random_uuid();
  v_match uuid := gen_random_uuid();
  v_host uuid;
  v_hunter uuid;
  v_result jsonb;
begin
  insert into auth.users(id) values (v_host_auth), (v_hunter_auth), (v_runner_auth);
  insert into public.matches(id, code_hash, state, round_seconds, head_start_seconds, ping_seconds,
    started_at, head_start_ends_at, ends_at, expires_at)
  values (v_match, decode(repeat('a', 64), 'hex'), 'ACTIVE', 2700, 0, 300,
    clock_timestamp() - interval '10 minutes', clock_timestamp() - interval '10 minutes',
    clock_timestamp() + interval '35 minutes', clock_timestamp() + interval '1 day');
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash, last_seen_at)
    values (v_match, v_host_auth, 'Visibility Host', 'HUNTER', decode(repeat('a1', 32), 'hex'), clock_timestamp() - interval '5 minutes') returning id into v_host;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match, v_hunter_auth, 'Other Hunter', 'HUNTER', decode(repeat('a2', 32), 'hex')) returning id into v_hunter;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match, v_runner_auth, 'Runner', 'RUNNER', decode(repeat('a3', 32), 'hex'));
  update public.matches set host_player_id = v_host, controller_player_id = v_host where id = v_match;

  v_result := public.xzones_report_controller_visibility(v_host_auth, v_match, true);
  if v_result->>'accepted' <> 'true' then raise exception 'host hidden heartbeat was rejected: %', v_result; end if;
  update public.players set last_seen_at = clock_timestamp() - interval '5 minutes',
    host_hidden_since = clock_timestamp() - interval '4 minutes' where id = v_host;
  perform public.xzones_resolve_match(v_hunter_auth, v_match);
  if not exists (select 1 from public.matches where id = v_match and controller_player_id = v_host) then
    raise exception 'hidden host should retain controller regardless of hidden duration';
  end if;

  v_result := public.xzones_report_controller_visibility(v_host_auth, v_match, false);
  if v_result->>'accepted' <> 'true' then raise exception 'host visible heartbeat was rejected: %', v_result; end if;
  if not exists (select 1 from public.players where id = v_host and host_hidden_since is null
    and last_seen_at > clock_timestamp() - interval '10 seconds') then
    raise exception 'visible heartbeat should clear hidden state and refresh activity';
  end if;
  update public.players set last_seen_at = clock_timestamp() - interval '181 seconds' where id = v_host;
  perform public.xzones_resolve_match(v_hunter_auth, v_match);
  if exists (select 1 from public.matches where id = v_match and controller_player_id = v_host) then
    raise exception 'visible controller inactive beyond 180 seconds should be released';
  end if;
end;
$$;
rollback;
