begin;

do $$
declare
  v_match uuid := gen_random_uuid();
  v_player uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_start timestamptz := '2026-10-20 12:00:00+00';
  v_state public.players%rowtype;
begin
  insert into auth.users(id) values (v_user);
  insert into public.matches (
    id, code_hash, state, round_seconds, head_start_seconds, zone_lat, zone_lon, zone_radius_m,
    started_at, head_start_ends_at, ends_at, expires_at
  ) values (
    v_match, decode(repeat('e', 64), 'hex'), 'ACTIVE', 1800, 0, 0, 0, 500,
    v_start, v_start, v_start + interval '1800 seconds', v_start + interval '2 hours'
  );
  insert into public.players (id, match_id, auth_user_id, display_name, role, session_cap_hash)
  values (v_player, v_match, v_user, 'Runner', 'RUNNER', decode(repeat('d', 64), 'hex'));

  insert into public.latest_fix (match_id, player_id, lat, lon, accuracy_m, captured_at, received_at, sequence)
  values (v_match, v_player, 0.01, 0, 5, v_start + interval '1 second', v_start + interval '1 second', 1);
  update public.latest_fix set accuracy_m = 800, captured_at = v_start + interval '20 seconds', received_at = v_start + interval '20 seconds', sequence = 2
    where player_id = v_player;
  select * into v_state from public.players where id = v_player;
  if v_state.zone_outside_samples <> 0 or v_state.zone_outside_since is not null then
    raise exception 'uncertain accuracy must reset the confirmed-outside streak: %', row_to_json(v_state);
  end if;
  update public.latest_fix set accuracy_m = 5, captured_at = v_start + interval '61 seconds', received_at = v_start + interval '61 seconds', sequence = 3
    where player_id = v_player;
  update public.latest_fix set captured_at = v_start + interval '62 seconds', received_at = v_start + interval '62 seconds', sequence = 4
    where player_id = v_player;
  update public.latest_fix set captured_at = v_start + interval '92 seconds', received_at = v_start + interval '92 seconds', sequence = 5
    where player_id = v_player;
  select * into v_state from public.players where id = v_player;
  if v_state.zone_outside_samples <> 2 or v_state.zone_revealed_at is null or v_state.zone_warning_at is null
     or v_state.status <> 'ACTIVE' then
    raise exception 'two confirmed outside fixes should reveal and warn without eliminating: %', row_to_json(v_state);
  end if;
  update public.latest_fix set captured_at = v_start + interval '151 seconds', received_at = v_start + interval '151 seconds', sequence = 6
    where player_id = v_player;
  select * into v_state from public.players where id = v_player;
  if v_state.status <> 'ACTIVE' then raise exception 'outside duration below 120 seconds must not eliminate: %', row_to_json(v_state); end if;
  update public.latest_fix set captured_at = v_start + interval '182 seconds', received_at = v_start + interval '182 seconds', sequence = 7
    where player_id = v_player;
  select * into v_state from public.players where id = v_player;
  if v_state.status <> 'TAGGED' then raise exception 'continuous 120-second zone exit should eliminate runner: %', row_to_json(v_state); end if;
end;
$$;

rollback;
