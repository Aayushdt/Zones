begin;
do $$
declare
  v_hunter_auth uuid := gen_random_uuid();
  v_runner_a_auth uuid := gen_random_uuid();
  v_runner_b_auth uuid := gen_random_uuid();
  v_other_hunter_auth uuid := gen_random_uuid();
  v_match uuid := gen_random_uuid();
  v_other_match uuid := gen_random_uuid();
  v_hunter uuid;
  v_runner_a uuid;
  v_runner_b uuid;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
  v_hash_a bytea := decode(repeat('1', 64), 'hex');
  v_hash_b bytea := decode(repeat('2', 64), 'hex');
  v_hash_c bytea := decode(repeat('3', 64), 'hex');
begin
  insert into auth.users(id) values (v_hunter_auth), (v_runner_a_auth), (v_runner_b_auth), (v_other_hunter_auth);
  insert into public.matches(id, code_hash, state, round_seconds, head_start_seconds, ping_seconds,
    started_at, head_start_ends_at, ends_at, expires_at)
  values (v_match, decode(repeat('4', 64), 'hex'), 'ACTIVE', 2700, 60, 300,
    v_now - interval '5 minutes', v_now - interval '4 minutes', v_now + interval '40 minutes', v_now + interval '1 day'),
         (v_other_match, decode(repeat('5', 64), 'hex'), 'ACTIVE', 2700, 60, 300,
    v_now - interval '5 minutes', v_now - interval '4 minutes', v_now + interval '40 minutes', v_now + interval '1 day');
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
  values (v_match, v_hunter_auth, 'Hunter', 'HUNTER', decode(repeat('6', 64), 'hex')) returning id into v_hunter;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match, v_runner_a_auth, 'Runner A', 'RUNNER', decode(repeat('7', 64), 'hex')) returning id into v_runner_a;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_match, v_runner_b_auth, 'Runner B', 'RUNNER', decode(repeat('8', 64), 'hex')) returning id into v_runner_b;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_other_match, v_other_hunter_auth, 'Other Hunter', 'HUNTER', decode(repeat('9', 64), 'hex'));

  perform set_config('request.jwt.claim.sub', v_hunter_auth::text, true);
  v_result := public.xzones_issue_qr(v_hunter_auth, v_match, decode(repeat('a', 64), 'hex'));
  if v_result->>'error' <> 'WRONG_ROLE' then raise exception 'Hunter cannot issue Runner QR: %', v_result; end if;

  perform set_config('request.jwt.claim.sub', v_runner_a_auth::text, true);
  v_result := public.xzones_issue_qr(v_runner_a_auth, v_match, v_hash_a);
  if v_result->>'expires_at' is null or v_result->>'server_now' is null or v_result ? 'token' then
    raise exception 'QR issue should return expiry and only store the token hash: %', v_result;
  end if;
  insert into public.latest_fix(match_id, player_id, lat, lon, accuracy_m, captured_at, sequence)
    values (v_match, v_runner_a, 25.61, 85.14, 8, v_now, 1);

  perform set_config('request.jwt.claim.sub', v_other_hunter_auth::text, true);
  v_result := public.xzones_scan_qr(v_other_hunter_auth, v_other_match, v_hash_a);
  if v_result->>'error' <> 'WRONG_MATCH' then raise exception 'QR must not cross match ids: %', v_result; end if;

  perform set_config('request.jwt.claim.sub', v_runner_b_auth::text, true);
  v_result := public.xzones_issue_qr(v_runner_b_auth, v_match, v_hash_b);
  if v_result->>'expires_at' is null then raise exception 'second Runner QR issue failed: %', v_result; end if;
  update public.qr_challenges set expires_at = v_now - interval '1 second' where token_hash = v_hash_b;
  perform set_config('request.jwt.claim.sub', v_hunter_auth::text, true);
  v_result := public.xzones_scan_qr(v_hunter_auth, v_match, v_hash_b);
  if v_result->>'error' <> 'QR_EXPIRED' then raise exception 'expired QR should reject: %', v_result; end if;

  perform set_config('request.jwt.claim.sub', v_runner_b_auth::text, true);
  v_result := public.xzones_issue_qr(v_runner_b_auth, v_match, v_hash_c);
  if v_result->>'expires_at' is null then raise exception 'rotated Runner QR issue failed: %', v_result; end if;
  perform set_config('request.jwt.claim.sub', v_runner_b_auth::text, true);
  v_result := public.xzones_scan_qr(v_runner_b_auth, v_match, v_hash_c);
  if v_result->>'error' <> 'WRONG_ROLE' then raise exception 'Runner cannot scan another QR: %', v_result; end if;
  v_result := public.xzones_confirm_tag(v_runner_b_auth, v_match);
  if (v_result->>'accepted')::boolean is not true or v_result->>'state' <> 'ACTIVE' then
    raise exception 'Runner fallback should tag only the current Runner: %', v_result;
  end if;
  if exists (select 1 from public.latest_fix where player_id = v_runner_b) then raise exception 'tagged Runner latest_fix must be deleted'; end if;

  perform set_config('request.jwt.claim.sub', v_hunter_auth::text, true);
  v_result := public.xzones_scan_qr(v_hunter_auth, v_match, v_hash_c);
  if v_result->>'error' <> 'QR_USED' then raise exception 'Runner tag must invalidate their QR: %', v_result; end if;
  v_result := public.xzones_scan_qr(v_hunter_auth, v_match, v_hash_a);
  if (v_result->>'accepted')::boolean is not true or v_result->>'winner' <> 'HUNTER' or v_result->>'state' <> 'ENDED' then
    raise exception 'last Runner QR tag should award Hunters and end: %', v_result;
  end if;
  if exists (select 1 from public.latest_fix where match_id = v_match) then raise exception 'all fixes must be deleted at end'; end if;
  if (select count(*) from public.tags where match_id = v_match) <> 2 then raise exception 'expected exactly two accepted tags'; end if;
  if (select count(*) from public.match_results where match_id = v_match and winner = 'HUNTER') <> 1 then
    raise exception 'Hunter result must be persisted once';
  end if;
end;
$$;
rollback;
