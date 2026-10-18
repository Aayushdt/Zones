-- Run after both migrations against a fresh local Supabase database.
begin;

do $$
declare
  v_host uuid := gen_random_uuid();
  v_runner_a uuid := gen_random_uuid();
  v_runner_b uuid := gen_random_uuid();
  v_match uuid;
  v_removed_player uuid;
  v_result jsonb;
  v_failed_bucket bytea := decode(repeat('f', 64), 'hex');
  v_user_bucket bytea := decode(repeat('1', 64), 'hex');
  v_code_hash bytea := decode(repeat('2', 64), 'hex');
  v_ip_bucket bytea := decode(repeat('a', 64), 'hex');
begin
  insert into auth.users (id) values (v_host), (v_runner_a), (v_runner_b);

  v_result := public.xzones_create_lobby(
    v_host, decode(repeat('3', 64), 'hex'), 'Host', v_code_hash,
    decode(repeat('4', 64), 'hex'), 2700, 180, 300, 42.88, 74.60, 1000
  );
  if v_result ? 'error' then raise exception 'create failed: %', v_result; end if;
  v_match := (v_result->>'match_id')::uuid;
  if (select zone_radius_m from public.matches where id = v_match) <> 500 then
    raise exception 'zone diameter 1000 did not store as 500m radius';
  end if;

  v_result := public.xzones_create_lobby(
    v_host, decode(repeat('9', 64), 'hex'), 'Ping Off', decode(repeat('8', 64), 'hex'),
    decode(repeat('7', 64), 'hex'), 600, 300, null, null, null, null
  );
  if v_result ? 'error' or (select ping_seconds from public.matches where id = (v_result->>'match_id')::uuid) is not null then
    raise exception 'valid Ping Off configuration should create a lobby: %', v_result;
  end if;

  v_result := public.xzones_create_lobby(
    v_host, decode(repeat('6', 64), 'hex'), 'Invalid timing', decode(repeat('5', 64), 'hex'),
    decode(repeat('4', 64), 'hex'), 600, 301, null, null, null, null
  );
  if v_result->>'error' <> 'INVALID_CONFIG' then
    raise exception 'configuration with less than five active minutes should be rejected: %', v_result;
  end if;

  v_result := public.xzones_create_lobby(
    v_host, decode(repeat('3', 64), 'hex'), 'Ping too late', decode(repeat('2', 64), 'hex'),
    decode(repeat('1', 64), 'hex'), 600, 300, 301, null, null, null
  );
  if v_result->>'error' <> 'INVALID_CONFIG' then
    raise exception 'ping interval greater than active time should be rejected: %', v_result;
  end if;

  v_result := public.xzones_join_lobby(
    v_runner_a, v_user_bucket, v_failed_bucket, 'Runner A', v_code_hash,
    decode(repeat('5', 64), 'hex')
  );
  if (v_result->>'match_id')::uuid <> v_match then raise exception 'valid join failed: %', v_result; end if;

  v_result := public.xzones_join_lobby(
    v_runner_b, decode(repeat('6', 64), 'hex'), decode(repeat('7', 64), 'hex'), 'Runner B', v_code_hash,
    decode(repeat('8', 64), 'hex')
  );
  if (v_result->>'match_id')::uuid <> v_match then raise exception 'third player join failed: %', v_result; end if;

  v_result := public.xzones_select_team(v_host, v_match, 'RANDOM');
  if v_result->>'role' <> 'HUNTER' then raise exception 'first Random did not fill Hunter side: %', v_result; end if;
  v_result := public.xzones_select_team(v_runner_a, v_match, 'RANDOM');
  if v_result->>'role' <> 'RUNNER' then raise exception 'second Random did not fill Runner side: %', v_result; end if;
  v_result := public.xzones_select_team(v_runner_b, v_match, 'RANDOM');
  if v_result->>'role' <> 'RUNNER' then raise exception 'third Random did not fill Runner side: %', v_result; end if;

  perform public.xzones_set_ready(v_host, v_match, true);
  perform public.xzones_set_ready(v_runner_a, v_match, true);
  v_result := public.xzones_set_ready(v_runner_b, v_match, true);
  if (v_result->>'can_start')::boolean is not true then
    raise exception 'fully balanced ready lobby did not become startable: %', v_result;
  end if;

  select id into v_removed_player from public.players where match_id = v_match and auth_user_id = v_runner_b;
  v_result := public.xzones_remove_lobby_player(v_host, v_match, v_removed_player);
  if v_result->>'accepted' <> 'true'
    or not exists (select 1 from public.players where id = v_removed_player and status = 'LEFT' and removed_from_lobby) then
    raise exception 'host removal must mark the player LEFT and prohibit rejoin: %', v_result;
  end if;
  v_result := public.xzones_join_lobby(v_runner_b, decode(repeat('a', 64), 'hex'), decode(repeat('b', 64), 'hex'),
    'Runner B', v_code_hash, decode(repeat('c', 64), 'hex'));
  if v_result->>'error' <> 'REMOVED_FROM_LOBBY' then
    raise exception 'removed player must not rejoin: %', v_result;
  end if;
  v_result := public.xzones_remove_lobby_player(v_runner_a, v_match, v_removed_player);
  if v_result->>'error' <> 'NOT_HOST' then raise exception 'non-host removal must be denied: %', v_result; end if;
  v_result := public.xzones_remove_lobby_player(v_host, v_match, (select host_player_id from public.matches where id = v_match));
  if v_result->>'error' <> 'CANNOT_REMOVE_SELF' then raise exception 'host cannot remove themself: %', v_result; end if;

  -- One valid join above already consumed this IP bucket: four invalid attempts remain.
  for i in 1..4 loop
    v_result := public.xzones_join_lobby(
      gen_random_uuid(), decode(repeat('9', 64), 'hex'), v_failed_bucket,
      'Invalid', decode(repeat('a', 64), 'hex'), decode(repeat('b', 64), 'hex')
    );
    if v_result->>'error' <> 'INVALID_CODE' then
      raise exception 'invalid code attempt % expected INVALID_CODE; received %', i, v_result;
    end if;
  end loop;
  v_result := public.xzones_join_lobby(
    gen_random_uuid(), decode(repeat('c', 64), 'hex'), v_failed_bucket,
    'Invalid', decode(repeat('d', 64), 'hex'), decode(repeat('e', 64), 'hex')
  );
  if v_result->>'error' <> 'RATE_LIMITED' then
    raise exception 'sixth IP-scoped join attempt did not hit the 5-per-10-minute limit: %', v_result;
  end if;

  update public.matches set state = 'ACTIVE' where id = v_match;
  v_result := public.xzones_remove_lobby_player(v_host, v_match,
    (select id from public.players where match_id = v_match and auth_user_id = v_runner_a));
  if v_result->>'error' <> 'INVALID_STATE' then
    raise exception 'removal after the lobby starts must be rejected: %', v_result;
  end if;
  for i in 1..5 loop
    v_result := public.xzones_join_lobby(gen_random_uuid(), decode(lpad(to_hex(i), 64, '1'), 'hex'),
      v_ip_bucket, 'Started attempt', v_code_hash, decode(repeat('d', 64), 'hex'));
    if v_result->>'error' <> 'MATCH_STARTED' then
      raise exception 'attempt % should be checked only after consuming the same IP bucket: %', i, v_result;
    end if;
  end loop;
  v_result := public.xzones_join_lobby(gen_random_uuid(), decode(repeat('e', 64), 'hex'),
    v_ip_bucket, 'Started attempt', v_code_hash, decode(repeat('f', 64), 'hex'));
  if v_result->>'error' <> 'RATE_LIMITED' then
    raise exception 'sixth attempt against a valid started lobby must hit the IP bucket before lookup: %', v_result;
  end if;
end;
$$;

rollback;
