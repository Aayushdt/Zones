-- Run after migrations 0001–0003 on a fresh local Supabase database.
-- Fixtures insert fake latest_fix rows directly; this requires no device GPS.
begin;

do $$
declare
  v_host uuid := '10000000-0000-4000-8000-000000000001';
  v_fresh_runner uuid := '20000000-0000-4000-8000-000000000002';
  v_stale_runner uuid := '30000000-0000-4000-8000-000000000003';
  v_no_fix_runner uuid := '35000000-0000-4000-8000-000000000005';
  v_match uuid := '40000000-0000-4000-8000-000000000004';
  v_hunter_result jsonb;
  v_retry_result jsonb;
  v_hunter_after_ack jsonb;
  v_runner_result jsonb;
  v_revision bigint;
begin
  insert into auth.users (id) values (v_host), (v_fresh_runner), (v_stale_runner), (v_no_fix_runner);

  insert into public.matches (
    id, code_hash, state, round_seconds, head_start_seconds, ping_seconds,
    started_at, head_start_ends_at, ends_at, expires_at
  ) values (
    v_match, decode(repeat('a', 64), 'hex'), 'HEAD_START', 2700, 180, 300,
    clock_timestamp() - interval '13 minutes',
    clock_timestamp() - interval '10 minutes',
    clock_timestamp() + interval '30 minutes',
    clock_timestamp() + interval '2 hours'
  );

  insert into public.players (id, match_id, auth_user_id, display_name, role, session_cap_hash)
  values
    (v_host, v_match, v_host, 'Fake Hunter', 'HUNTER', decode(repeat('b', 64), 'hex')),
    (v_fresh_runner, v_match, v_fresh_runner, 'Fake Runner A', 'RUNNER', decode(repeat('c', 64), 'hex')),
    (v_stale_runner, v_match, v_stale_runner, 'Fake Runner B', 'RUNNER', decode(repeat('d', 64), 'hex')),
    (v_no_fix_runner, v_match, v_no_fix_runner, 'Fake Runner C', 'RUNNER', decode(repeat('e', 64), 'hex'));

  update public.matches set host_player_id = v_host, controller_player_id = v_host where id = v_match;

  insert into public.latest_fix (player_id, match_id, lat, lon, accuracy_m, captured_at, received_at, sequence)
  values
    (v_fresh_runner, v_match, 42.88, 74.60, 5, clock_timestamp() - interval '4 seconds', clock_timestamp() - interval '4 seconds', 1),
    (v_stale_runner, v_match, 42.89, 74.61, 8, clock_timestamp() - interval '70 seconds', clock_timestamp() - interval '70 seconds', 1);

  v_hunter_result := public.xzones_sync_match(v_host, v_match, 0);
  if v_hunter_result->>'state' <> 'ACTIVE' then raise exception 'head-start did not transition to ACTIVE: %', v_hunter_result; end if;
  if v_hunter_result->'active_counts' <> '{"hunters":1,"runners":3}'::jsonb then
    raise exception 'match state counts should be aggregate only: %', v_hunter_result->'active_counts';
  end if;
  if jsonb_array_length(v_hunter_result->'due_pings') <> 3 then
    raise exception 'Hunter should receive one latest snapshot per Runner: %', v_hunter_result->'due_pings';
  end if;
  if (select count(*) from public.ping_snapshots where match_id = v_match) <> 3
     or exists (select 1 from public.ping_snapshots where match_id = v_match and ping_index <> 2) then
    raise exception 'missed ping slots should be coalesced to one index per Runner';
  end if;
  if (v_hunter_result->'due_pings'->0->>'ping_index')::integer <> 2
     or (v_hunter_result->'due_pings'->1->>'ping_index')::integer <> 2 then
    raise exception 'coalesced snapshots should use latest due index 2';
  end if;
  if v_hunter_result->'due_pings'->0->>'status' <> 'OK'
     or v_hunter_result->'due_pings'->0->>'lat' is null then
    raise exception 'fresh Runner fix should be an OK snapshot';
  end if;
  if v_hunter_result->'due_pings'->1->>'status' <> 'STALE'
     or v_hunter_result->'due_pings'->1->>'lat' is not null then
    raise exception 'stale Runner fix must be labelled and coordinate-free';
  end if;
  if v_hunter_result->'due_pings'->2->>'status' <> 'NO_FIX'
     or v_hunter_result->'due_pings'->2->>'lat' is not null then
    raise exception 'Runner without a fix must be labelled and coordinate-free';
  end if;

  v_revision := (v_hunter_result->>'revision')::bigint;
  v_retry_result := public.xzones_sync_match(v_host, v_match, 0);
  if v_retry_result->'due_pings' <> v_hunter_result->'due_pings' then
    raise exception 'retry with same revision must return the committed same snapshots';
  end if;
  v_hunter_after_ack := public.xzones_sync_match(v_host, v_match, v_revision);
  if jsonb_array_length(v_hunter_after_ack->'due_pings') <> 0 then
    raise exception 'acknowledged revision should not replay pings';
  end if;

  v_runner_result := public.xzones_sync_match(v_fresh_runner, v_match, 0);
  if v_runner_result->>'role' <> 'RUNNER'
     or jsonb_array_length(v_runner_result->'due_pings') <> 0
     or v_runner_result->'runner_notice'->>'ping_index' <> '2' then
    raise exception 'Runner should receive only generic ping notice: %', v_runner_result;
  end if;
  if v_runner_result ? 'lat' or v_runner_result ? 'lon'
     or v_runner_result::text like '%42.88%' or v_runner_result::text like '%hunter.runner_ping%' then
    raise exception 'Runner sync response leaked coordinate or Hunter snapshot fields';
  end if;

  update public.players set status = 'TAGGED' where id = v_fresh_runner;
  delete from public.latest_fix where player_id = v_fresh_runner;
  v_runner_result := public.xzones_sync_match(v_fresh_runner, v_match, 0);
  if v_runner_result->>'own_status' <> 'TAGGED' or v_runner_result->>'own_player_id' <> v_fresh_runner::text
     or v_runner_result->'runner_notice' <> 'null'::jsonb then
    raise exception 'Tagged Runner must receive own status only, with no ping notice: %', v_runner_result;
  end if;
end;
$$;

rollback;
