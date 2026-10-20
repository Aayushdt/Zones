begin;

do $$
declare
  v_host uuid := gen_random_uuid();
  v_runner uuid := gen_random_uuid();
  v_full_host uuid := gen_random_uuid();
  v_overflow_user uuid := gen_random_uuid();
  v_direct_overflow_user uuid := gen_random_uuid();
  v_match uuid;
  v_full_match uuid;
  v_result jsonb;
  v_lobby jsonb;
  v_revision bigint;
begin
  insert into auth.users(id) values (v_host), (v_runner), (v_full_host), (v_overflow_user), (v_direct_overflow_user);

  v_result := public.xzones_create_lobby(v_host, decode(repeat('1', 64), 'hex'), 'Host',
    decode(repeat('2', 64), 'hex'), decode(repeat('3', 64), 'hex'), 600, 0, null, null, null, null);
  v_match := (v_result->>'match_id')::uuid;
  v_result := public.xzones_join_lobby(v_runner, decode(repeat('4', 64), 'hex'), decode(repeat('5', 64), 'hex'),
    'Runner', decode(repeat('2', 64), 'hex'), decode(repeat('6', 64), 'hex'));
  if v_result->>'match_id' <> v_match::text then raise exception 'second player could not join: %', v_result; end if;

  perform public.xzones_select_team(v_host, v_match, 'HUNTER');
  perform public.xzones_select_team(v_runner, v_match, 'RUNNER');
  perform public.xzones_set_ready(v_host, v_match, true);
  v_result := public.xzones_set_ready(v_runner, v_match, true);
  if (v_result->>'can_start')::boolean is not true then raise exception 'two-player lobby should be startable: %', v_result; end if;
  v_lobby := public.xzones_lobby_status(v_match);
  if v_lobby->>'player_count' <> '2' or v_lobby->>'can_start' <> 'true' then
    raise exception 'two-player lobby status is wrong: %', v_lobby;
  end if;
  select revision into v_revision from public.matches where id = v_match;
  v_result := public.xzones_start_match(v_host, v_match, v_revision);
  if v_result->>'state' <> 'HEAD_START' then raise exception 'two-player match did not start: %', v_result; end if;

  v_result := public.xzones_create_lobby(v_full_host, decode(repeat('7', 64), 'hex'), 'Full Host',
    decode(repeat('8', 64), 'hex'), decode(repeat('9', 64), 'hex'), 600, 0, null, null, null, null);
  v_full_match := (v_result->>'match_id')::uuid;

  with new_users as (
    insert into auth.users(id)
    select gen_random_uuid() from generate_series(1, 99)
    returning id
  )
  insert into public.players(match_id, auth_user_id, display_name, session_cap_hash)
  select v_full_match, id, 'Player ' || row_number() over (order by id), decode(repeat('a', 64), 'hex')
  from new_users;

  v_lobby := public.xzones_lobby_status(v_full_match);
  if v_lobby->>'player_count' <> '100' or v_lobby->>'block_reason' <> 'NEEDS_TEAMS' then
    raise exception '100-player lobby should remain within bounds: %', v_lobby;
  end if;
  v_result := public.xzones_join_lobby(v_overflow_user, decode(repeat('b', 64), 'hex'), decode(repeat('c', 64), 'hex'),
    'Overflow', decode(repeat('8', 64), 'hex'), decode(repeat('d', 64), 'hex'));
  if v_result->>'error' <> 'LOBBY_FULL' then raise exception '101st RPC join should be rejected: %', v_result; end if;

  begin
    insert into public.players(match_id, auth_user_id, display_name, session_cap_hash)
    values (v_full_match, v_direct_overflow_user, 'Direct overflow', decode(repeat('e', 64), 'hex'));
    raise exception 'database guard allowed a 101st active player';
  exception when check_violation then
    if sqlerrm <> 'LOBBY_FULL' then raise; end if;
  end;

  if (select count(*) from public.players where match_id = v_full_match and status = 'ACTIVE') <> 100 then
    raise exception 'player count changed after rejected overflow';
  end if;
end;
$$;

rollback;
