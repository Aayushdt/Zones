alter table public.matches alter column round_seconds drop not null;
alter table public.matches drop constraint matches_round_seconds_check;
alter table public.matches add constraint matches_round_seconds_check
  check (round_seconds is null or round_seconds between 600 and 10800);

create or replace function public.xzones_issue_qr(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_token_hash bytea
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_runner_id uuid;
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz;
  v_advance jsonb;
begin
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then return jsonb_build_object('error', 'INVALID_INPUT'); end if;
  v_advance := public.xzones_advance_match_state(p_auth_user_id, p_match_id);
  if v_advance ? 'error' then return v_advance; end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state <> 'ACTIVE' or (v_match.ends_at is not null and v_now >= v_match.ends_at) then
    return jsonb_build_object('error', 'INACTIVE');
  end if;
  select id into v_runner_id from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and role = 'RUNNER' and status = 'ACTIVE';
  if not found then return jsonb_build_object('error', 'WRONG_ROLE'); end if;
  delete from public.qr_challenges where match_id = p_match_id and runner_id = v_runner_id and used_at is null;
  v_expires_at := v_now + interval '60 seconds';
  insert into public.qr_challenges(match_id, runner_id, token_hash, expires_at)
  values (p_match_id, v_runner_id, p_token_hash, v_expires_at);
  return jsonb_build_object('expires_at', v_expires_at, 'server_now', v_now);
end;
$$;

create or replace function public.xzones_sync_match(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_last_revision bigint default 0
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_role public.player_role;
  v_own_status public.player_status;
  v_own_player_id uuid;
  v_server_now timestamptz := clock_timestamp();
  v_active_at timestamptz;
  v_due_index integer;
  v_last_due_index integer;
  v_ping_at timestamptz;
  v_next_ping_at timestamptz;
  v_hunters integer;
  v_runners integer;
  v_due_pings jsonb := '[]'::jsonb;
  v_runner_notice jsonb;
begin
  if p_last_revision is null or p_last_revision < 0 then return jsonb_build_object('error', 'INVALID_INPUT'); end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  select id, role, status into v_own_player_id, v_role, v_own_status from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status in ('ACTIVE', 'TAGGED');
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;
  if v_role is null then return jsonb_build_object('error', 'TEAM_NOT_SELECTED'); end if;
  if v_match.state = 'HEAD_START' and v_match.head_start_ends_at <= v_server_now then
    update public.matches set state = 'ACTIVE', revision = revision + 1 where id = p_match_id;
    select * into v_match from public.matches where id = p_match_id;
  end if;
  select count(*) filter (where role = 'HUNTER'), count(*) filter (where role = 'RUNNER')
    into v_hunters, v_runners from public.players where match_id = p_match_id and status = 'ACTIVE';
  v_active_at := v_match.head_start_ends_at;
  if v_match.state = 'ACTIVE' and v_match.ping_seconds is not null and v_active_at is not null
     and (v_match.ends_at is null or v_server_now < v_match.ends_at) then
    v_due_index := floor(extract(epoch from (v_server_now - v_active_at)) / v_match.ping_seconds)::integer;
    if v_match.ends_at is null then
      v_last_due_index := v_due_index;
    else
      v_last_due_index := floor(extract(epoch from (v_match.ends_at - v_active_at - interval '1 millisecond')) / v_match.ping_seconds)::integer;
      v_due_index := least(v_due_index, v_last_due_index);
    end if;
    if v_due_index >= 0 and v_due_index > v_match.last_ping_index then
      v_ping_at := v_active_at + make_interval(secs => v_due_index * v_match.ping_seconds);
      insert into public.ping_snapshots (
        match_id, runner_id, ping_index, status, lat, lon, accuracy_m, captured_at,
        ping_at, age_seconds, received_at, revision
      )
      select p_match_id, p.id, v_due_index,
        case when f.player_id is null then 'NO_FIX' when f.captured_at <= v_server_now - interval '60 seconds' then 'STALE' else 'OK' end,
        case when f.player_id is not null and f.captured_at > v_server_now - interval '60 seconds' then f.lat else null end,
        case when f.player_id is not null and f.captured_at > v_server_now - interval '60 seconds' then f.lon else null end,
        case when f.player_id is not null and f.captured_at > v_server_now - interval '60 seconds' then f.accuracy_m else null end,
        case when f.player_id is not null and f.captured_at > v_server_now - interval '60 seconds' then f.captured_at else null end,
        v_ping_at, case when f.player_id is null then 0 else greatest(0, floor(extract(epoch from (v_server_now - f.captured_at))))::integer end,
        v_server_now, v_match.revision + 1
      from public.players p left join public.latest_fix f on f.match_id = p.match_id and f.player_id = p.id
      where p.match_id = p_match_id and p.role = 'RUNNER' and p.status = 'ACTIVE'
      on conflict (match_id, runner_id, ping_index) do nothing;
      update public.matches set last_ping_index = v_due_index, revision = revision + 1 where id = p_match_id;
      select * into v_match from public.matches where id = p_match_id;
    end if;
  end if;
  if v_role = 'HUNTER' and v_match.last_ping_index >= 0 then
    select coalesce(jsonb_agg(jsonb_build_object('runner_id', latest.runner_id, 'status', latest.status,
      'lat', latest.lat, 'lon', latest.lon, 'accuracy_m', latest.accuracy_m, 'captured_at', latest.captured_at,
      'ping_at', latest.ping_at, 'age_seconds', latest.age_seconds, 'ping_index', latest.ping_index,
      'revision', latest.revision) order by latest.runner_id), '[]'::jsonb)
    into v_due_pings from (
      select distinct on (s.runner_id) s.runner_id, s.status, s.lat, s.lon, s.accuracy_m, s.captured_at,
        s.age_seconds, s.ping_at, s.received_at, s.ping_index, s.revision
      from public.ping_snapshots s where s.match_id = p_match_id and s.revision > p_last_revision
        and s.ping_index <= v_match.last_ping_index order by s.runner_id, s.revision desc, s.ping_index desc
    ) latest;
  elsif v_role = 'RUNNER' and v_own_status = 'ACTIVE' and v_match.last_ping_index >= 0 then
    select jsonb_build_object('ping_index', s.ping_index, 'ping_at', s.ping_at, 'revision', s.revision)
      into v_runner_notice from public.ping_snapshots s where s.match_id = p_match_id and s.revision > p_last_revision
      order by s.revision desc limit 1;
  end if;
  if v_match.state in ('HEAD_START', 'ACTIVE') and v_match.ping_seconds is not null and v_match.last_ping_index >= -1 then
    v_next_ping_at := v_active_at + make_interval(secs => (v_match.last_ping_index + 1) * v_match.ping_seconds);
    if v_match.ends_at is not null and v_next_ping_at >= v_match.ends_at then v_next_ping_at := null; end if;
  end if;
  return jsonb_build_object('state', v_match.state, 'server_now', v_server_now, 'ends_at', v_match.ends_at,
    'revision', v_match.revision, 'role', v_role, 'own_player_id', v_own_player_id, 'own_status', v_own_status,
    'active_counts', jsonb_build_object('hunters', v_hunters, 'runners', v_runners),
    'due_pings', case when v_role = 'HUNTER' then v_due_pings else '[]'::jsonb end,
    'runner_notice', case when v_role = 'RUNNER' then v_runner_notice else null end, 'next_ping_at', v_next_ping_at);
end;
$$;

revoke all on function public.xzones_issue_qr(uuid, uuid, bytea) from public, anon, authenticated;
revoke all on function public.xzones_sync_match(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.xzones_issue_qr(uuid, uuid, bytea) to service_role;
grant execute on function public.xzones_sync_match(uuid, uuid, bigint) to service_role;
