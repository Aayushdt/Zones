begin;

do $$
declare
  v_hunter uuid := gen_random_uuid();
  v_runner uuid := gen_random_uuid();
  v_match uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_token_hash bytea := decode(repeat('a', 64), 'hex');
  v_result jsonb;
begin
  insert into auth.users(id) values (v_hunter), (v_runner);
  insert into public.matches (id, code_hash, state, round_seconds, head_start_seconds, started_at,
    head_start_ends_at, expires_at)
  values (v_match, decode(repeat('9', 64), 'hex'), 'ACTIVE', 1800, 0,
    v_now - interval '1 minute', v_now - interval '1 minute', v_now + interval '2 hours');
  insert into public.players (id, match_id, auth_user_id, display_name, role, session_cap_hash)
  values (v_hunter, v_match, v_hunter, 'Hunter', 'HUNTER', decode(repeat('1', 64), 'hex')),
    (v_runner, v_match, v_runner, 'Runner', 'RUNNER', decode(repeat('2', 64), 'hex'));
  insert into public.qr_challenges(id, match_id, runner_id, token_hash, expires_at)
  values (v_challenge, v_match, v_runner, v_token_hash, v_now + interval '60 seconds');
  insert into public.latest_fix (match_id, player_id, lat, lon, accuracy_m, captured_at, received_at, sequence)
  values (v_match, v_hunter, 0, 0, 5, v_now, v_now, 1),
    (v_match, v_runner, 0.002, 0, 5, v_now, v_now, 1);

  v_result := public.xzones_scan_qr(v_hunter, v_match, v_token_hash);
  if v_result->>'error' <> 'QR_RELAY_BLOCKED' then raise exception 'fresh fixes over 100m must block QR relay: %', v_result; end if;
  if (select used_at from public.qr_challenges where id = v_challenge) is not null then
    raise exception 'blocked QR challenge must remain unused';
  end if;
  update public.latest_fix set lat = 0.0005, captured_at = clock_timestamp(), received_at = clock_timestamp(), sequence = 2
    where player_id = v_runner;
  v_result := public.xzones_scan_qr(v_hunter, v_match, v_token_hash);
  if v_result->>'accepted' <> 'true' then raise exception 'nearby QR fallback should remain available: %', v_result; end if;
end;
$$;

rollback;
