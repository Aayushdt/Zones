begin;
do $$
declare
  v_hunter uuid := gen_random_uuid();
  v_runner uuid := gen_random_uuid();
  v_match uuid := gen_random_uuid();
begin
  insert into auth.users(id) values (v_hunter), (v_runner);
  insert into public.matches(id, code_hash, round_seconds, head_start_seconds, ping_seconds, expires_at)
    values (v_match, decode(repeat('a', 64), 'hex'), 2700, 60, 300, clock_timestamp() + interval '1 day');
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match, v_hunter, 'Hunter', 'HUNTER', decode(repeat('b', 64), 'hex')),
           (v_match, v_runner, 'Runner', 'RUNNER', decode(repeat('c', 64), 'hex'));

  perform set_config('request.jwt.claim.sub', v_hunter::text, true);
  if not public.xzones_can_receive_realtime_topic('match:' || v_match::text || ':hunter') then
    raise exception 'Hunter must be authorized for Hunter topic';
  end if;
  if public.xzones_can_receive_realtime_topic('match:' || v_match::text || ':runner') then
    raise exception 'Hunter must be denied Runner topic';
  end if;
  if public.xzones_can_receive_realtime_topic('match:' || v_match::text || ':hunter:extra') then
    raise exception 'topic suffix injection must be denied';
  end if;

  perform set_config('request.jwt.claim.sub', v_runner::text, true);
  if not public.xzones_can_receive_realtime_topic('match:' || v_match::text || ':runner') then
    raise exception 'Runner must be authorized for Runner topic';
  end if;
  if public.xzones_can_receive_realtime_topic('match:' || v_match::text || ':hunter') then
    raise exception 'Runner must be denied Hunter topic';
  end if;

  update public.players set status = 'LEFT' where match_id = v_match and auth_user_id = v_runner;
  if public.xzones_can_receive_realtime_topic('match:' || v_match::text || ':runner') then
    raise exception 'A left player must lose channel authorization';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
      and policyname = 'xzones_private_role_channel_receive' and cmd = 'SELECT') then
    raise exception 'Expected SELECT policy missing on realtime.messages';
  end if;
end;
$$;
rollback;
