begin;
do $$
declare
  v_host_auth uuid := gen_random_uuid();
  v_runner_auth uuid := gen_random_uuid();
  v_hunter_auth uuid := gen_random_uuid();
  v_match uuid := gen_random_uuid();
  v_host uuid;
  v_runner uuid;
  v_hunter uuid;
  v_result jsonb;
begin
  insert into auth.users(id) values (v_host_auth), (v_runner_auth), (v_hunter_auth);
  insert into public.matches(id, code_hash, state, round_seconds, head_start_seconds, ping_seconds, expires_at)
    values (v_match, decode(repeat('c', 64), 'hex'), 'LOBBY', 2700, 0, 300, clock_timestamp() + interval '1 day');
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match, v_host_auth, 'Chat Host', 'HUNTER', decode(repeat('c1', 32), 'hex')) returning id into v_host;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match, v_runner_auth, 'Chat Runner', 'RUNNER', decode(repeat('c2', 32), 'hex')) returning id into v_runner;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match, v_hunter_auth, 'Chat Hunter', 'HUNTER', decode(repeat('c3', 32), 'hex')) returning id into v_hunter;

  v_result := public.xzones_send_chat_message(v_host_auth, v_match, 'lobby-wide', 280, 2);
  if v_result->>'body' <> 'lobby-wide' then raise exception 'lobby message was not accepted: %', v_result; end if;
  v_result := public.xzones_send_chat_message(v_runner_auth, v_match, 'also-wide', 280, 2);
  if v_result->>'body' <> 'also-wide' then raise exception 'Runner lobby message was not accepted: %', v_result; end if;
  if jsonb_array_length(public.xzones_list_chat(v_hunter_auth, v_match)->'messages') <> 2 then
    raise exception 'all active lobby participants should see lobby chat';
  end if;
  v_result := public.xzones_send_chat_message(v_host_auth, v_match, '   ', 280, 2);
  if v_result->>'error' <> 'INVALID_INPUT' then raise exception 'blank chat should be rejected: %', v_result; end if;
  v_result := public.xzones_send_chat_message(v_host_auth, v_match, repeat('x', 281), 280, 2);
  if v_result->>'error' <> 'INVALID_INPUT' then raise exception 'overlong chat should be rejected: %', v_result; end if;
  v_result := public.xzones_send_chat_message(v_host_auth, v_match, 'too-fast', 280, 2);
  if v_result->>'error' <> 'RATE_LIMITED' then raise exception 'chat spam should be rate-limited: %', v_result; end if;

  update public.matches set state = 'ACTIVE', started_at = clock_timestamp(),
    head_start_ends_at = clock_timestamp(), ends_at = clock_timestamp() + interval '30 minutes' where id = v_match;
  update public.players set last_chat_at = null where match_id = v_match;
  perform public.xzones_send_chat_message(v_host_auth, v_match, 'hunter-only', 280, 2);
  update public.players set last_chat_at = null where id = v_runner;
  perform public.xzones_send_chat_message(v_runner_auth, v_match, 'runner-only', 280, 2);
  if jsonb_array_length(public.xzones_list_chat(v_host_auth, v_match)->'messages') <> 1
    or public.xzones_list_chat(v_host_auth, v_match)->'messages'->0->>'body' <> 'hunter-only' then
    raise exception 'Hunter should see only Hunter chat during match';
  end if;
  if jsonb_array_length(public.xzones_list_chat(v_runner_auth, v_match)->'messages') <> 1
    or public.xzones_list_chat(v_runner_auth, v_match)->'messages'->0->>'body' <> 'runner-only' then
    raise exception 'Runner should see only Runner chat during match';
  end if;
  perform public.xzones_finish_match(v_match, 'RUNNER', 'TIME_LIMIT');
  if exists (select 1 from public.chat_messages where match_id = v_match) then
    raise exception 'match end must delete chat history';
  end if;
end;
$$;
rollback;
