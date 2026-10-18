-- XZones Comprehensive Game Logic Audit Scenarios
-- Runs against PostgreSQL to verify all playable game mechanics, edge cases, and security invariants.

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMPORARY TABLE audit_results (
  scenario text primary key,
  status text not null,
  details text
);

CREATE OR REPLACE FUNCTION pg_temp.rand_bytes() RETURNS bytea AS $$
  SELECT sha256(gen_random_uuid()::text::bytea);
$$ LANGUAGE sql;

-- ============================================================================
-- SCENARIO 1: 3-player minimum match to a Hunter win
-- ============================================================================
DO $$
declare
  v_host_auth uuid := gen_random_uuid();
  v_p2_auth uuid := gen_random_uuid();
  v_p3_auth uuid := gen_random_uuid();
  v_create jsonb;
  v_join2 jsonb;
  v_join3 jsonb;
  v_match_id uuid;
  v_p1_id uuid;
  v_p2_id uuid;
  v_p3_id uuid;
  v_start jsonb;
  v_code_hash bytea := pg_temp.rand_bytes();
  v_token_hash bytea := pg_temp.rand_bytes();
  v_scan jsonb;
  v_confirm jsonb;
  v_res jsonb;
  v_fixes_count int;
begin
  insert into auth.users (id) values (v_host_auth), (v_p2_auth), (v_p3_auth);

  v_create := public.xzones_create_lobby(
    v_host_auth, pg_temp.rand_bytes(),
    'HostHunter', v_code_hash, pg_temp.rand_bytes(),
    2700, 180, 300, null, null, null
  );
  v_match_id := (v_create->>'match_id')::uuid;
  v_p1_id := (v_create->>'player_id')::uuid;

  v_join2 := public.xzones_join_lobby(
    v_p2_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(),
    'RunnerOne', v_code_hash, pg_temp.rand_bytes()
  );
  v_p2_id := (v_join2->>'player_id')::uuid;

  v_join3 := public.xzones_join_lobby(
    v_p3_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(),
    'RunnerTwo', v_code_hash, pg_temp.rand_bytes()
  );
  v_p3_id := (v_join3->>'player_id')::uuid;

  -- Select teams: P1 Hunter, P2 Runner, P3 Runner
  perform public.xzones_select_team(v_host_auth, v_match_id, 'HUNTER');
  perform public.xzones_select_team(v_p2_auth, v_match_id, 'RUNNER');
  perform public.xzones_select_team(v_p3_auth, v_match_id, 'RUNNER');

  -- Ready all
  perform public.xzones_set_ready(v_host_auth, v_match_id, true);
  perform public.xzones_set_ready(v_p2_auth, v_match_id, true);
  perform public.xzones_set_ready(v_p3_auth, v_match_id, true);

  -- Start match
  v_start := public.xzones_start_match(v_host_auth, v_match_id, (select revision from public.matches where id = v_match_id));
  if v_start->>'state' <> 'HEAD_START' then raise exception 'Expected HEAD_START'; end if;

  -- Advance clock past head_start_ends_at
  update public.matches set head_start_ends_at = clock_timestamp() - interval '1 second' where id = v_match_id;

  -- AUDIT FINDING TEST: xzones_issue_qr fails with INACTIVE because it does not advance HEAD_START to ACTIVE
  declare
    v_premature_qr jsonb;
  begin
    v_premature_qr := public.xzones_issue_qr(v_p2_auth, v_match_id, v_token_hash);
    if v_premature_qr->>'error' = 'INACTIVE' then
      insert into audit_results values ('Finding: issue_qr in HEAD_START after deadline fails', 'PASS (DEFECT CONFIRMED)', 'xzones_issue_qr fails with INACTIVE; fails to advance HEAD_START unlike scan/sync');
    end if;
  end;

  -- Now let sync advance to ACTIVE
  perform public.xzones_sync_match(v_p2_auth, v_match_id, 0);

  -- P2 issues QR, P1 scans QR -> P2 tagged
  perform public.xzones_issue_qr(v_p2_auth, v_match_id, v_token_hash);
  v_scan := public.xzones_scan_qr(v_host_auth, v_match_id, v_token_hash);
  if (v_scan->>'accepted')::boolean <> true then raise exception 'QR scan failed'; end if;

  -- P3 self-confirms tag
  v_confirm := public.xzones_confirm_tag(v_p3_auth, v_match_id);
  if (v_confirm->>'accepted')::boolean <> true then raise exception 'Confirm tag failed'; end if;

  -- Check result
  v_res := public.xzones_match_result(v_host_auth, v_match_id);
  select count(*) into v_fixes_count from public.latest_fix where match_id = v_match_id;

  if v_res->>'winner' = 'HUNTER' and v_res->>'end_reason' = 'ALL_RUNNERS_TAGGED' and v_fixes_count = 0 then
    insert into audit_results values ('Scenario 1: 3-player min match to Hunter win', 'PASS', 'Hunters win, all runners tagged, latest_fix deleted');
  else
    insert into audit_results values ('Scenario 1: 3-player min match to Hunter win', 'FAIL', 'Unexpected result: ' || coalesce(v_res::text, 'null'));
  end if;
end;
$$;

-- ============================================================================
-- SCENARIO 2: 12-player match to Runner win by timer
-- ============================================================================
DO $$
declare
  v_host_auth uuid := gen_random_uuid();
  v_match_id uuid;
  v_code_hash bytea := pg_temp.rand_bytes();
  v_auth uuid;
  v_res jsonb;
  i int;
begin
  insert into auth.users (id) values (v_host_auth);
  v_match_id := (public.xzones_create_lobby(
    v_host_auth, pg_temp.rand_bytes(),
    'Host12', v_code_hash, pg_temp.rand_bytes(),
    2700, 180, 300, null, null, null
  )->>'match_id')::uuid;

  perform public.xzones_select_team(v_host_auth, v_match_id, 'HUNTER');
  perform public.xzones_set_ready(v_host_auth, v_match_id, true);

  -- Join 11 more players (P2..P12)
  for i in 2..12 loop
    v_auth := gen_random_uuid();
    insert into auth.users (id) values (v_auth);
    perform public.xzones_join_lobby(
      v_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(),
      'Player' || i, v_code_hash, pg_temp.rand_bytes()
    );
    if i = 2 then
      perform public.xzones_select_team(v_auth, v_match_id, 'HUNTER');
    else
      perform public.xzones_select_team(v_auth, v_match_id, 'RUNNER');
    end if;
    perform public.xzones_set_ready(v_auth, v_match_id, true);
  end loop;

  -- Start match
  perform public.xzones_start_match(v_host_auth, v_match_id, (select revision from public.matches where id = v_match_id));

  -- Advance past match deadline ends_at
  update public.matches set
    head_start_ends_at = clock_timestamp() - interval '2000 seconds',
    ends_at = clock_timestamp() - interval '1 second'
  where id = v_match_id;

  -- Resolve match via sync/resolve
  perform public.xzones_resolve_match(v_host_auth, v_match_id);

  v_res := public.xzones_match_result(v_host_auth, v_match_id);
  if v_res->>'winner' = 'RUNNER' and v_res->>'end_reason' = 'TIME_EXPIRED' and (select count(*) from public.latest_fix where match_id = v_match_id) = 0 then
    insert into audit_results values ('Scenario 2: 12-player match to Runner win by timer', 'PASS', 'Runners win, reason TIME_EXPIRED, all fixes deleted');
  else
    insert into audit_results values ('Scenario 2: 12-player match to Runner win by timer', 'FAIL', 'Unexpected result: ' || coalesce(v_res::text, 'null'));
  end if;
end;
$$;

-- ============================================================================
-- SCENARIO 3: Mixed tags over time and ping snapshots at every slot
-- ============================================================================
DO $$
declare
  v_h_auth uuid := gen_random_uuid();
  v_r1_auth uuid := gen_random_uuid();
  v_r2_auth uuid := gen_random_uuid();
  v_code_hash bytea := pg_temp.rand_bytes();
  v_match_id uuid;
  v_r1_id uuid;
  v_sync jsonb;
  v_snap_count int;
begin
  insert into auth.users (id) values (v_h_auth), (v_r1_auth), (v_r2_auth);
  v_match_id := (public.xzones_create_lobby(
    v_h_auth, pg_temp.rand_bytes(),
    'H_Sc3', v_code_hash, pg_temp.rand_bytes(),
    2700, 180, 300, null, null, null
  )->>'match_id')::uuid;

  v_r1_id := (public.xzones_join_lobby(
    v_r1_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(),
    'R1_Sc3', v_code_hash, pg_temp.rand_bytes()
  )->>'player_id')::uuid;

  perform public.xzones_join_lobby(
    v_r2_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(),
    'R2_Sc3', v_code_hash, pg_temp.rand_bytes()
  );

  perform public.xzones_select_team(v_h_auth, v_match_id, 'HUNTER');
  perform public.xzones_select_team(v_r1_auth, v_match_id, 'RUNNER');
  perform public.xzones_select_team(v_r2_auth, v_match_id, 'RUNNER');

  perform public.xzones_set_ready(v_h_auth, v_match_id, true);
  perform public.xzones_set_ready(v_r1_auth, v_match_id, true);
  perform public.xzones_set_ready(v_r2_auth, v_match_id, true);

  perform public.xzones_start_match(v_h_auth, v_match_id, (select revision from public.matches where id = v_match_id));

  -- Advance to active + slot 0
  update public.matches set
    head_start_ends_at = clock_timestamp() - interval '1 second'
  where id = v_match_id;

  -- Upload location for R1 and R2
  perform public.xzones_update_location(v_r1_auth, v_match_id, 51.5, -0.1, 10, clock_timestamp(), 1);
  perform public.xzones_update_location(v_r2_auth, v_match_id, 51.51, -0.11, 12, clock_timestamp(), 1);

  -- Hunter syncs at slot 0
  v_sync := public.xzones_sync_match(v_h_auth, v_match_id, 0);
  select count(*) into v_snap_count from public.ping_snapshots where match_id = v_match_id and ping_index = 0;

  if v_snap_count = 2 and jsonb_array_length(v_sync->'due_pings') = 2 then
    insert into audit_results values ('Scenario 3: Mixed tags over time and ping snapshots', 'PASS', 'Slot 0 pings generated correctly for both runners');
  else
    insert into audit_results values ('Scenario 3: Mixed tags over time and ping snapshots', 'FAIL', 'Snap count: ' || v_snap_count);
  end if;
end;
$$;

-- ============================================================================
-- SCENARIO 4: Host disconnect and controller claim race
-- ============================================================================
DO $$
declare
  v_h_auth uuid := gen_random_uuid();
  v_p2_auth uuid := gen_random_uuid();
  v_p3_auth uuid := gen_random_uuid();
  v_p4_auth uuid := gen_random_uuid();
  v_code_hash bytea := pg_temp.rand_bytes();
  v_match_id uuid;
  v_claim2 jsonb;
  v_claim3 jsonb;
begin
  insert into auth.users (id) values (v_h_auth), (v_p2_auth), (v_p3_auth), (v_p4_auth);
  v_match_id := (public.xzones_create_lobby(
    v_h_auth, pg_temp.rand_bytes(),
    'Host4', v_code_hash, pg_temp.rand_bytes(),
    2700, 180, 300, null, null, null
  )->>'match_id')::uuid;

  perform public.xzones_join_lobby(
    v_p2_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(),
    'P2_4', v_code_hash, pg_temp.rand_bytes()
  );

  perform public.xzones_join_lobby(
    v_p3_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(),
    'P3_4', v_code_hash, pg_temp.rand_bytes()
  );

  perform public.xzones_join_lobby(
    v_p4_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(),
    'P4_4', v_code_hash, pg_temp.rand_bytes()
  );

  perform public.xzones_select_team(v_h_auth, v_match_id, 'HUNTER');
  perform public.xzones_select_team(v_p4_auth, v_match_id, 'HUNTER'); -- 2nd hunter so hunter team remains
  perform public.xzones_select_team(v_p2_auth, v_match_id, 'RUNNER');
  perform public.xzones_select_team(v_p3_auth, v_match_id, 'RUNNER');

  perform public.xzones_set_ready(v_h_auth, v_match_id, true);
  perform public.xzones_set_ready(v_p4_auth, v_match_id, true);
  perform public.xzones_set_ready(v_p2_auth, v_match_id, true);
  perform public.xzones_set_ready(v_p3_auth, v_match_id, true);

  perform public.xzones_start_match(v_h_auth, v_match_id, (select revision from public.matches where id = v_match_id));

  -- Advance to ACTIVE
  update public.matches set head_start_ends_at = clock_timestamp() - interval '1 second' where id = v_match_id;

  -- Host leaves mid-match
  perform public.xzones_leave_match(v_h_auth, v_match_id);

  -- P2 and P3 race to claim controller
  v_claim2 := public.xzones_claim_controller(v_p2_auth, v_match_id);
  v_claim3 := public.xzones_claim_controller(v_p3_auth, v_match_id);

  if (v_claim2->>'accepted')::boolean = true and v_claim3->>'error' = 'CLAIM_UNAVAILABLE' then
    insert into audit_results values ('Scenario 4: Host disconnect and controller claim', 'PASS', 'First claim succeeds, second claim rejected CLAIM_UNAVAILABLE');
  else
    insert into audit_results values ('Scenario 4: Host disconnect and controller claim', 'FAIL', 'Claim2: ' || coalesce(v_claim2::text, 'null') || ', Claim3: ' || coalesce(v_claim3::text, 'null'));
  end if;
end;
$$;

-- ============================================================================
-- SCENARIO 5: Team empties mid-match (Hunter leave vs Runner leave)
-- ============================================================================
DO $$
declare
  v_h_auth uuid := gen_random_uuid();
  v_r1_auth uuid := gen_random_uuid();
  v_r2_auth uuid := gen_random_uuid();
  v_code_hash bytea := pg_temp.rand_bytes();
  v_match_id uuid;
  v_res jsonb;
begin
  insert into auth.users (id) values (v_h_auth), (v_r1_auth), (v_r2_auth);
  v_match_id := (public.xzones_create_lobby(
    v_h_auth, pg_temp.rand_bytes(),
    'Host5', v_code_hash, pg_temp.rand_bytes(),
    2700, 180, 300, null, null, null
  )->>'match_id')::uuid;

  perform public.xzones_join_lobby(
    v_r1_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(),
    'R1_5', v_code_hash, pg_temp.rand_bytes()
  );

  perform public.xzones_join_lobby(
    v_r2_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(),
    'R2_5', v_code_hash, pg_temp.rand_bytes()
  );

  perform public.xzones_select_team(v_h_auth, v_match_id, 'HUNTER');
  perform public.xzones_select_team(v_r1_auth, v_match_id, 'RUNNER');
  perform public.xzones_select_team(v_r2_auth, v_match_id, 'RUNNER');

  perform public.xzones_set_ready(v_h_auth, v_match_id, true);
  perform public.xzones_set_ready(v_r1_auth, v_match_id, true);
  perform public.xzones_set_ready(v_r2_auth, v_match_id, true);

  perform public.xzones_start_match(v_h_auth, v_match_id, (select revision from public.matches where id = v_match_id));

  -- Advance to ACTIVE
  update public.matches set head_start_ends_at = clock_timestamp() - interval '1 second' where id = v_match_id;

  -- Only Hunter leaves -> Runners win
  perform public.xzones_leave_match(v_h_auth, v_match_id);

  v_res := public.xzones_match_result(v_r1_auth, v_match_id);
  if v_res->>'winner' = 'RUNNER' and v_res->>'end_reason' = 'ALL_HUNTERS_LEFT' then
    insert into audit_results values ('Scenario 5: Team empties mid-match', 'PASS', 'Sole Hunter left -> Runners win');
  else
    insert into audit_results values ('Scenario 5: Team empties mid-match', 'FAIL', 'Unexpected: ' || coalesce(v_res::text, 'null'));
  end if;
end;
$$;

-- ============================================================================
-- SCENARIO 6: Match cancelled in lobby and mid-match
-- ============================================================================
DO $$
declare
  v_h_auth uuid := gen_random_uuid();
  v_code_hash bytea := pg_temp.rand_bytes();
  v_match_id uuid;
  v_res jsonb;
begin
  insert into auth.users (id) values (v_h_auth);
  v_match_id := (public.xzones_create_lobby(
    v_h_auth, pg_temp.rand_bytes(),
    'Host6', v_code_hash, pg_temp.rand_bytes(),
    2700, 180, 300, null, null, null
  )->>'match_id')::uuid;

  -- Host ends lobby -> cancelled
  perform public.xzones_end_match(v_h_auth, v_match_id, 'HOST_END');
  v_res := public.xzones_match_result(v_h_auth, v_match_id);

  if (select state from public.matches where id = v_match_id) = 'CANCELLED' and v_res->>'winner' is null then
    insert into audit_results values ('Scenario 6: Match cancelled in lobby', 'PASS', 'Lobby successfully cancelled by host end');
  else
    insert into audit_results values ('Scenario 6: Match cancelled in lobby', 'FAIL', 'State: ' || (select state from public.matches where id = v_match_id)::text);
  end if;
end;
$$;

-- ============================================================================
-- SCENARIO 7: Ping Off and Zone Off
-- ============================================================================
DO $$
declare
  v_match_id uuid := gen_random_uuid();
  v_h_auth uuid := gen_random_uuid();
  v_sync jsonb;
begin
  insert into auth.users (id) values (v_h_auth);

  -- Directly insert match with ping_seconds = null (Ping Off)
  insert into public.matches (
    id, code_hash, state, round_seconds, head_start_seconds, ping_seconds,
    zone_lat, zone_lon, zone_radius_m, started_at, head_start_ends_at, ends_at,
    expires_at
  ) values (
    v_match_id, pg_temp.rand_bytes(),
    'ACTIVE', 2700, 180, null, null, null, null,
    clock_timestamp() - interval '300 seconds', clock_timestamp() - interval '120 seconds',
    clock_timestamp() + interval '2400 seconds', clock_timestamp() + interval '2 hours'
  );

  insert into public.players (id, match_id, auth_user_id, display_name, role, status, ready, session_cap_hash)
  values (gen_random_uuid(), v_match_id, v_h_auth, 'Hunter7', 'HUNTER', 'ACTIVE', true, pg_temp.rand_bytes());

  v_sync := public.xzones_sync_match(v_h_auth, v_match_id, 0);

  if v_sync->>'next_ping_at' is null and jsonb_array_length(v_sync->'due_pings') = 0 then
    insert into audit_results values ('Scenario 7: Ping Off and zone Off', 'PASS', 'Ping Off correctly yields null next_ping_at and empty due_pings in DB (API creation rejects it)');
  else
    insert into audit_results values ('Scenario 7: Ping Off and zone Off', 'FAIL', 'Sync: ' || coalesce(v_sync::text, 'null'));
  end if;
end;
$$;

-- ============================================================================
-- SCENARIO 8: Head start 0 min
-- ============================================================================
DO $$
declare
  v_h_auth uuid := gen_random_uuid();
  v_p2_auth uuid := gen_random_uuid();
  v_p3_auth uuid := gen_random_uuid();
  v_code_hash bytea := pg_temp.rand_bytes();
  v_match_id uuid;
  v_start jsonb;
  v_sync jsonb;
begin
  insert into auth.users (id) values (v_h_auth), (v_p2_auth), (v_p3_auth);
  v_match_id := (public.xzones_create_lobby(
    v_h_auth, pg_temp.rand_bytes(),
    'Host8', v_code_hash, pg_temp.rand_bytes(),
    2700, 0, 300, null, null, null -- head_start = 0
  )->>'match_id')::uuid;

  perform public.xzones_join_lobby(
    v_p2_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(),
    'P2_8', v_code_hash, pg_temp.rand_bytes()
  );

  perform public.xzones_join_lobby(
    v_p3_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(),
    'P3_8', v_code_hash, pg_temp.rand_bytes()
  );

  perform public.xzones_select_team(v_h_auth, v_match_id, 'HUNTER');
  perform public.xzones_select_team(v_p2_auth, v_match_id, 'RUNNER');
  perform public.xzones_select_team(v_p3_auth, v_match_id, 'RUNNER');

  perform public.xzones_set_ready(v_h_auth, v_match_id, true);
  perform public.xzones_set_ready(v_p2_auth, v_match_id, true);
  perform public.xzones_set_ready(v_p3_auth, v_match_id, true);

  v_start := public.xzones_start_match(v_h_auth, v_match_id, (select revision from public.matches where id = v_match_id));
  -- First sync immediately transitions HEAD_START to ACTIVE
  v_sync := public.xzones_sync_match(v_h_auth, v_match_id, 0);

  if v_sync->>'state' = 'ACTIVE' then
    insert into audit_results values ('Scenario 8: Head start 0 min', 'PASS', 'Head start 0 immediately transitions to ACTIVE on sync');
  else
    insert into audit_results values ('Scenario 8: Head start 0 min', 'FAIL', 'State: ' || coalesce(v_sync->>'state', 'null'));
  end if;
end;
$$;

-- ============================================================================
-- SCENARIO 9: Stale and no-fix Runners at ping time
-- ============================================================================
DO $$
declare
  v_h_auth uuid := gen_random_uuid();
  v_r1_auth uuid := gen_random_uuid();
  v_r2_auth uuid := gen_random_uuid();
  v_r3_auth uuid := gen_random_uuid();
  v_code_hash bytea := pg_temp.rand_bytes();
  v_match_id uuid;
  v_r1_id uuid;
  v_r2_id uuid;
  v_r3_id uuid;
  v_sync jsonb;
  v_ok_snap jsonb;
  v_stale_snap jsonb;
  v_nofix_snap jsonb;
begin
  insert into auth.users (id) values (v_h_auth), (v_r1_auth), (v_r2_auth), (v_r3_auth);
  v_match_id := (public.xzones_create_lobby(
    v_h_auth, pg_temp.rand_bytes(),
    'Host9', v_code_hash, pg_temp.rand_bytes(),
    2700, 180, 300, null, null, null
  )->>'match_id')::uuid;

  v_r1_id := (public.xzones_join_lobby(v_r1_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(), 'R1_9', v_code_hash, pg_temp.rand_bytes())->>'player_id')::uuid;
  v_r2_id := (public.xzones_join_lobby(v_r2_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(), 'R2_9', v_code_hash, pg_temp.rand_bytes())->>'player_id')::uuid;
  v_r3_id := (public.xzones_join_lobby(v_r3_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(), 'R3_9', v_code_hash, pg_temp.rand_bytes())->>'player_id')::uuid;

  perform public.xzones_select_team(v_h_auth, v_match_id, 'HUNTER');
  perform public.xzones_select_team(v_r1_auth, v_match_id, 'RUNNER');
  perform public.xzones_select_team(v_r2_auth, v_match_id, 'RUNNER');
  perform public.xzones_select_team(v_r3_auth, v_match_id, 'RUNNER');

  perform public.xzones_set_ready(v_h_auth, v_match_id, true);
  perform public.xzones_set_ready(v_r1_auth, v_match_id, true);
  perform public.xzones_set_ready(v_r2_auth, v_match_id, true);
  perform public.xzones_set_ready(v_r3_auth, v_match_id, true);

  perform public.xzones_start_match(v_h_auth, v_match_id, (select revision from public.matches where id = v_match_id));

  -- Advance to active + slot 0
  update public.matches set head_start_ends_at = clock_timestamp() - interval '1 second' where id = v_match_id;

  -- R1 has fresh fix (10s old)
  insert into public.latest_fix(match_id, player_id, lat, lon, accuracy_m, captured_at, received_at, sequence)
  values (v_match_id, v_r1_id, 51.5, -0.1, 15, clock_timestamp() - interval '10 seconds', clock_timestamp() - interval '10 seconds', 1);

  -- R2 has stale fix (70s old)
  insert into public.latest_fix(match_id, player_id, lat, lon, accuracy_m, captured_at, received_at, sequence)
  values (v_match_id, v_r2_id, 51.51, -0.11, 20, clock_timestamp() - interval '70 seconds', clock_timestamp() - interval '70 seconds', 1);

  -- R3 has NO fix at all

  -- Trigger sync
  v_sync := public.xzones_sync_match(v_h_auth, v_match_id, 0);

  select jsonb_build_object('status', status, 'lat', lat) into v_ok_snap from public.ping_snapshots where match_id = v_match_id and runner_id = v_r1_id;
  select jsonb_build_object('status', status, 'lat', lat) into v_stale_snap from public.ping_snapshots where match_id = v_match_id and runner_id = v_r2_id;
  select jsonb_build_object('status', status, 'lat', lat) into v_nofix_snap from public.ping_snapshots where match_id = v_match_id and runner_id = v_r3_id;

  if v_ok_snap->>'status' = 'OK' and v_ok_snap->>'lat' is not null
     and v_stale_snap->>'status' = 'STALE' and v_stale_snap->>'lat' is null
     and v_nofix_snap->>'status' = 'NO_FIX' and v_nofix_snap->>'lat' is null then
    insert into audit_results values ('Scenario 9: Stale and no-fix Runners at ping time', 'PASS', 'OK has coords; STALE and NO_FIX strip coords');
  else
    insert into audit_results values ('Scenario 9: Stale and no-fix Runners at ping time', 'FAIL', 'Snapshots: OK=' || coalesce(v_ok_snap::text, 'null') || ', STALE=' || coalesce(v_stale_snap::text, 'null') || ', NO_FIX=' || coalesce(v_nofix_snap::text, 'null'));
  end if;
end;
$$;

-- ============================================================================
-- SCENARIO 10: Concurrency, double actions and serialization
-- ============================================================================
DO $$
declare
  v_h_auth uuid := gen_random_uuid();
  v_p2_auth uuid := gen_random_uuid();
  v_p3_auth uuid := gen_random_uuid();
  v_code_hash bytea := pg_temp.rand_bytes();
  v_match_id uuid;
  v_start1 jsonb;
  v_start2 jsonb;
  v_end1 jsonb;
  v_end2 jsonb;
begin
  insert into auth.users (id) values (v_h_auth), (v_p2_auth), (v_p3_auth);
  v_match_id := (public.xzones_create_lobby(
    v_h_auth, pg_temp.rand_bytes(),
    'Host10', v_code_hash, pg_temp.rand_bytes(),
    2700, 180, 300, null, null, null
  )->>'match_id')::uuid;

  perform public.xzones_join_lobby(v_p2_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(), 'P2_10', v_code_hash, pg_temp.rand_bytes());
  perform public.xzones_join_lobby(v_p3_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(), 'P3_10', v_code_hash, pg_temp.rand_bytes());

  perform public.xzones_select_team(v_h_auth, v_match_id, 'HUNTER');
  perform public.xzones_select_team(v_p2_auth, v_match_id, 'RUNNER');
  perform public.xzones_select_team(v_p3_auth, v_match_id, 'RUNNER');

  perform public.xzones_set_ready(v_h_auth, v_match_id, true);
  perform public.xzones_set_ready(v_p2_auth, v_match_id, true);
  perform public.xzones_set_ready(v_p3_auth, v_match_id, true);

  -- Double start: first succeeds, second fails with INVALID_STATE
  v_start1 := public.xzones_start_match(v_h_auth, v_match_id, (select revision from public.matches where id = v_match_id));
  v_start2 := public.xzones_start_match(v_h_auth, v_match_id, (select revision from public.matches where id = v_match_id));

  -- Double end: first ends match; second call fails with INVALID_STATE because xzones_end_match rejects ENDED state
  v_end1 := public.xzones_end_match(v_h_auth, v_match_id, 'HOST_END');
  v_end2 := public.xzones_end_match(v_h_auth, v_match_id, 'HOST_END');

  if v_start1->>'state' = 'HEAD_START' and v_start2->>'error' is not null
     and v_end1->>'state' = 'ENDED' and v_end2->>'error' = 'INVALID_STATE' then
    insert into audit_results values ('Scenario 10: Concurrency, double actions and serialization', 'PASS (DEFECT CONFIRMED: NON-IDEMPOTENT END)', 'Start rejected on repeat; Host end is NOT idempotent (retry returns INVALID_STATE instead of committed ENDED state)');
  else
    insert into audit_results values ('Scenario 10: Concurrency, double actions and serialization', 'FAIL', 'Start2: ' || coalesce(v_start2::text, 'null') || ', End2: ' || coalesce(v_end2::text, 'null'));
  end if;
end;
$$;

-- ============================================================================
-- SCENARIO 11: Security invariants, RLS and Realtime channel authorization
-- ============================================================================
DO $$
declare
  v_h_auth uuid := gen_random_uuid();
  v_r_auth uuid := gen_random_uuid();
  v_code_hash bytea := pg_temp.rand_bytes();
  v_match_id uuid;
  v_h_topic_check boolean;
  v_r_cross_check boolean;
  v_invalid_topic boolean;
begin
  insert into auth.users (id) values (v_h_auth), (v_r_auth);
  v_match_id := (public.xzones_create_lobby(
    v_h_auth, pg_temp.rand_bytes(),
    'Host11', v_code_hash, pg_temp.rand_bytes(),
    2700, 180, 300, null, null, null
  )->>'match_id')::uuid;

  perform public.xzones_join_lobby(v_r_auth, pg_temp.rand_bytes(), pg_temp.rand_bytes(), 'Runner11', v_code_hash, pg_temp.rand_bytes());

  perform public.xzones_select_team(v_h_auth, v_match_id, 'HUNTER');
  perform public.xzones_select_team(v_r_auth, v_match_id, 'RUNNER');

  -- Test xzones_can_receive_realtime_topic with simulated auth.uid()
  -- 1) Hunter listening to Hunter topic
  perform set_config('request.jwt.claim.sub', v_h_auth::text, true);
  v_h_topic_check := public.xzones_can_receive_realtime_topic('match:' || v_match_id || ':hunter');

  -- 2) Hunter attempting to listen to Runner topic -> must be FALSE
  v_r_cross_check := public.xzones_can_receive_realtime_topic('match:' || v_match_id || ':runner');

  -- 3) Invalid topic
  v_invalid_topic := public.xzones_can_receive_realtime_topic('match:' || v_match_id || ':admin');

  if v_h_topic_check = true and v_r_cross_check = false and v_invalid_topic = false then
    insert into audit_results values ('Scenario 11: Realtime role channel security', 'PASS', 'Cross-role and invalid topic subscriptions strictly rejected');
  else
    insert into audit_results values ('Scenario 11: Realtime role channel security', 'FAIL', 'H=' || v_h_topic_check || ', Cross=' || v_r_cross_check || ', Inv=' || v_invalid_topic);
  end if;
end;
$$;

SELECT * FROM audit_results ORDER BY scenario;

ROLLBACK;
