begin;
do $$
declare
  v_host uuid := gen_random_uuid();
  v_runner_a uuid := gen_random_uuid();
  v_runner_b uuid := gen_random_uuid();
  v_match uuid;
  v_result jsonb;
  v_revision bigint;
begin
  insert into auth.users(id) values (v_host), (v_runner_a), (v_runner_b);
  v_result := public.xzones_create_lobby(v_host, decode(repeat('1', 64), 'hex'), 'Host',
    decode(repeat('2', 64), 'hex'), decode(repeat('3', 64), 'hex'), 2700, 60, 300, null, null, null);
  v_match := (v_result->>'match_id')::uuid;
  perform public.xzones_join_lobby(v_runner_a, decode(repeat('4', 64), 'hex'), decode(repeat('5', 64), 'hex'),
    'Runner A', decode(repeat('2', 64), 'hex'), decode(repeat('6', 64), 'hex'));
  perform public.xzones_join_lobby(v_runner_b, decode(repeat('7', 64), 'hex'), decode(repeat('8', 64), 'hex'),
    'Runner B', decode(repeat('2', 64), 'hex'), decode(repeat('9', 64), 'hex'));

  v_result := public.xzones_sync_lobby(v_host, v_match);
  if v_result->>'state' <> 'LOBBY' or jsonb_array_length(v_result->'players') <> 3 then
    raise exception 'safe lobby roster missing: %', v_result;
  end if;
  if v_result->'players'->0 ? 'auth_user_id' or v_result ? 'join_code' or v_result ? 'coordinates' then
    raise exception 'lobby response contains hidden fields: %', v_result;
  end if;
  if v_result->>'block_reason' <> 'NEEDS_TEAMS' then raise exception 'expected team block: %', v_result; end if;

  perform public.xzones_select_team(v_host, v_match, 'RANDOM');
  perform public.xzones_select_team(v_runner_a, v_match, 'RANDOM');
  perform public.xzones_select_team(v_runner_b, v_match, 'RANDOM');
  v_result := public.xzones_set_ready(v_host, v_match, true);
  perform public.xzones_set_ready(v_runner_a, v_match, true);
  v_result := public.xzones_set_ready(v_runner_b, v_match, true);
  if (v_result->>'can_start')::boolean is not true then raise exception 'ready match should be startable: %', v_result; end if;
  select revision into v_revision from public.matches where id = v_match;

  v_result := public.xzones_start_match(v_runner_a, v_match, v_revision);
  if v_result->>'error' <> 'NOT_HOST' then raise exception 'non-controller must not start: %', v_result; end if;
  v_result := public.xzones_start_match(v_host, v_match, v_revision - 1);
  if v_result->>'error' <> 'REVISION_CONFLICT' then raise exception 'stale revision must reject: %', v_result; end if;
  v_result := public.xzones_start_match(v_host, v_match, v_revision);
  if v_result->>'state' <> 'HEAD_START' or v_result->>'start_at' is null or v_result->>'ends_at' is null then
    raise exception 'controller start should return server clock: %', v_result;
  end if;
end;
$$;
rollback;
