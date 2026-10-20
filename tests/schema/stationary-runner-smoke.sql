begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_player uuid := gen_random_uuid();
  v_match uuid := gen_random_uuid();
  v_start timestamptz := '2026-10-20 12:00:00+00';
  v_state public.players%rowtype;
begin
  insert into auth.users(id) values (v_user);
  insert into public.matches (id, code_hash, state, round_seconds, head_start_seconds, started_at,
    head_start_ends_at, expires_at)
  values (v_match, decode(repeat('8', 64), 'hex'), 'ACTIVE', 1800, 0, v_start, v_start, v_start + interval '2 hours');
  insert into public.players (id, match_id, auth_user_id, display_name, role, session_cap_hash)
  values (v_player, v_match, v_user, 'Runner', 'RUNNER', decode(repeat('9', 64), 'hex'));
  insert into public.latest_fix (match_id, player_id, lat, lon, accuracy_m, captured_at, received_at, sequence)
  values (v_match, v_player, 0, 0, 5, v_start, v_start, 1);

  update public.latest_fix set received_at = v_start + interval '239 seconds', captured_at = v_start + interval '239 seconds', sequence = 2 where player_id = v_player;
  select * into v_state from public.players where id = v_player;
  if v_state.stationary_warning_at is not null or v_state.stationary_revealed_at is not null then
    raise exception 'stationary warning/reveal occurred before thresholds: %', row_to_json(v_state);
  end if;
  update public.latest_fix set received_at = v_start + interval '240 seconds', captured_at = v_start + interval '240 seconds', sequence = 3 where player_id = v_player;
  select * into v_state from public.players where id = v_player;
  if v_state.stationary_warning_at is null or v_state.stationary_revealed_at is not null or v_state.status <> 'ACTIVE' then
    raise exception 'stationary warning should trigger at 80 percent without elimination: %', row_to_json(v_state);
  end if;
  update public.latest_fix set received_at = v_start + interval '299 seconds', captured_at = v_start + interval '299 seconds', sequence = 4 where player_id = v_player;
  select * into v_state from public.players where id = v_player;
  if v_state.stationary_revealed_at is not null then raise exception 'reveal should not occur before 300 seconds'; end if;
  update public.latest_fix set received_at = v_start + interval '300 seconds', captured_at = v_start + interval '300 seconds', sequence = 5 where player_id = v_player;
  select * into v_state from public.players where id = v_player;
  if v_state.stationary_revealed_at is null or v_state.status <> 'ACTIVE' then
    raise exception 'stationary Runner should be revealed, not eliminated: %', row_to_json(v_state);
  end if;
  update public.latest_fix set lat = 0.00015, received_at = v_start + interval '301 seconds',
    captured_at = v_start + interval '301 seconds', sequence = 6 where player_id = v_player;
  select * into v_state from public.players where id = v_player;
  if v_state.stationary_warning_at is not null or v_state.stationary_revealed_at is not null
    or v_state.stationary_since <> v_start + interval '301 seconds' then
    raise exception 'confirmed movement should reset the stationary timer and reveal: %', row_to_json(v_state);
  end if;
end;
$$;

rollback;
