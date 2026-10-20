begin;
do $$
declare
  v_auth uuid := gen_random_uuid();
  v_active_match uuid := gen_random_uuid();
  v_ended_match uuid := gen_random_uuid();
  v_active_player uuid;
  v_result jsonb;
begin
  insert into auth.users(id) values (v_auth);
  insert into public.matches(id, code_hash, state, round_seconds, head_start_seconds, ping_seconds,
    started_at, head_start_ends_at, ends_at, expires_at)
  values
    (v_active_match, decode(repeat('a', 64), 'hex'), 'ACTIVE', 2700, 0, 300, clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '30 minutes', clock_timestamp() + interval '1 day'),
    (v_ended_match, decode(repeat('b', 64), 'hex'), 'ENDED', 2700, 0, 300, clock_timestamp() - interval '1 hour', clock_timestamp() - interval '1 hour', clock_timestamp() - interval '30 minutes', clock_timestamp() - interval '30 minutes');
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_active_match, v_auth, 'Rejoin Runner', 'RUNNER', decode(repeat('a1', 32), 'hex')) returning id into v_active_player;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash, status)
    values (v_ended_match, v_auth, 'Old Runner', 'RUNNER', decode(repeat('a2', 32), 'hex'), 'LEFT');
  v_result := public.xzones_find_rejoinable_match(v_auth);
  if v_result->>'match_id' <> v_active_match::text or v_result->>'state' <> 'ACTIVE' then
    raise exception 'only the session-linked active player in a non-ended match is rejoinable: %', v_result;
  end if;
  update public.players set status = 'LEFT' where id = v_active_player;
  v_result := public.xzones_find_rejoinable_match(v_auth);
  if v_result->>'match_id' is not null then raise exception 'explicitly left players must not rejoin: %', v_result; end if;
end;
$$;
rollback;
