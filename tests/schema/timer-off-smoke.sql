begin;

do $$
declare
  v_host uuid := gen_random_uuid();
  v_runner uuid := gen_random_uuid();
  v_match uuid;
  v_result jsonb;
  v_start jsonb;
  v_sync jsonb;
begin
  insert into auth.users(id) values (v_host), (v_runner);
  v_result := public.xzones_create_lobby(v_host, decode(repeat('1', 64), 'hex'), 'Host',
    decode(repeat('2', 64), 'hex'), decode(repeat('3', 64), 'hex'), null, 0, 60, null, null, null);
  if v_result->>'error' is not null then raise exception 'timer-off lobby rejected: %', v_result; end if;
  v_match := (v_result->>'match_id')::uuid;
  v_result := public.xzones_join_lobby(v_runner, decode(repeat('4', 64), 'hex'), decode(repeat('5', 64), 'hex'),
    'Runner', decode(repeat('2', 64), 'hex'), decode(repeat('6', 64), 'hex'));
  if v_result->>'error' is not null then raise exception 'timer-off runner could not join: %', v_result; end if;
  perform public.xzones_select_team(v_host, v_match, 'HUNTER');
  perform public.xzones_select_team(v_runner, v_match, 'RUNNER');
  perform public.xzones_set_ready(v_host, v_match, true);
  perform public.xzones_set_ready(v_runner, v_match, true);
  v_start := public.xzones_start_match(v_host, v_match, (select revision from public.matches where id = v_match));
  if v_start->>'ends_at' is not null or (select round_seconds from public.matches where id = v_match) is not null then
    raise exception 'timer-off match should store no round deadline: %', v_start;
  end if;
  update public.matches set started_at = clock_timestamp() - interval '10 minutes',
    head_start_ends_at = clock_timestamp() - interval '10 minutes', ends_at = null where id = v_match;
  v_result := public.xzones_resolve_match(v_host, v_match);
  if v_result->>'state' <> 'ACTIVE' then raise exception 'timer-off match must not end by elapsed time: %', v_result; end if;
  v_sync := public.xzones_sync_match(v_runner, v_match, 0);
  if v_sync->>'next_ping_at' is null or (select last_ping_index from public.matches where id = v_match) < 0 then
    raise exception 'timer-off match should continue scheduled pings: %', v_sync;
  end if;
end;
$$;

rollback;
