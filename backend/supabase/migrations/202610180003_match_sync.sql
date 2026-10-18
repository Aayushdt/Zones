alter table public.ping_snapshots
  add column status text not null default 'OK'
    check (status in ('OK', 'NO_FIX', 'STALE')),
  add column age_seconds integer not null default 0 check (age_seconds >= 0),
  add column received_at timestamptz not null default now(),
  add column revision bigint not null default 0 check (revision >= 0),
  alter column lat drop not null,
  alter column lon drop not null,
  alter column accuracy_m drop not null,
  alter column captured_at drop not null,
  add constraint ping_snapshots_fix_status_check check (
    (status = 'OK' and lat is not null and lon is not null and accuracy_m is not null and captured_at is not null)
    or (status in ('NO_FIX', 'STALE') and lat is null and lon is null and accuracy_m is null and captured_at is null)
  );

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
  if p_last_revision is null or p_last_revision < 0 then
    return jsonb_build_object('error', 'INVALID_INPUT');
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;

  select role into v_role from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE';
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;
  if v_role is null then return jsonb_build_object('error', 'TEAM_NOT_SELECTED'); end if;

  if v_match.state = 'HEAD_START' and v_match.head_start_ends_at <= v_server_now then
    update public.matches set state = 'ACTIVE', revision = revision + 1 where id = p_match_id;
    select * into v_match from public.matches where id = p_match_id;
  end if;

  select count(*) filter (where role = 'HUNTER'), count(*) filter (where role = 'RUNNER')
    into v_hunters, v_runners
    from public.players where match_id = p_match_id and status = 'ACTIVE';

  v_active_at := v_match.head_start_ends_at;
  if v_match.state = 'ACTIVE' and v_match.ping_seconds is not null
     and v_active_at is not null and v_server_now < v_match.ends_at then
    v_due_index := floor(extract(epoch from (v_server_now - v_active_at)) / v_match.ping_seconds)::integer;
    v_last_due_index := floor(
      extract(epoch from (v_match.ends_at - v_active_at - interval '1 millisecond')) / v_match.ping_seconds
    )::integer;
    v_due_index := least(v_due_index, v_last_due_index);

    if v_due_index >= 0 and v_due_index > v_match.last_ping_index then
      v_ping_at := v_active_at + make_interval(secs => v_due_index * v_match.ping_seconds);

      insert into public.ping_snapshots (
        match_id, runner_id, ping_index, status, lat, lon, accuracy_m,
        captured_at, ping_at, age_seconds, received_at, revision
      )
      select
        p_match_id,
        p.id,
        v_due_index,
        case
          when f.player_id is null then 'NO_FIX'
          when f.captured_at <= v_server_now - interval '60 seconds' then 'STALE'
          else 'OK'
        end,
        case when f.player_id is not null and f.captured_at > v_server_now - interval '60 seconds' then f.lat else null end,
        case when f.player_id is not null and f.captured_at > v_server_now - interval '60 seconds' then f.lon else null end,
        case when f.player_id is not null and f.captured_at > v_server_now - interval '60 seconds' then f.accuracy_m else null end,
        case when f.player_id is not null and f.captured_at > v_server_now - interval '60 seconds' then f.captured_at else null end,
        v_ping_at,
        case when f.player_id is null then 0 else greatest(0, floor(extract(epoch from (v_server_now - f.captured_at))))::integer end,
        v_server_now,
        v_match.revision + 1
      from public.players p
      left join public.latest_fix f on f.match_id = p.match_id and f.player_id = p.id
      where p.match_id = p_match_id and p.role = 'RUNNER' and p.status = 'ACTIVE'
      on conflict (match_id, runner_id, ping_index) do nothing;

      update public.matches
        set last_ping_index = v_due_index, revision = revision + 1
        where id = p_match_id;
      select * into v_match from public.matches where id = p_match_id;
    end if;
  end if;

  if v_role = 'HUNTER' and v_match.last_ping_index >= 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'runner_id', latest.runner_id,
      'status', latest.status,
      'lat', latest.lat,
      'lon', latest.lon,
      'accuracy_m', latest.accuracy_m,
      'captured_at', latest.captured_at,
      'ping_at', latest.ping_at,
      'age_seconds', latest.age_seconds,
      'ping_index', latest.ping_index,
      'revision', latest.revision
    ) order by latest.runner_id), '[]'::jsonb)
    into v_due_pings
    from (
      select distinct on (s.runner_id)
        s.runner_id, s.status, s.lat, s.lon, s.accuracy_m, s.captured_at, s.age_seconds,
        s.ping_at, s.received_at, s.ping_index, s.revision
      from public.ping_snapshots s
      where s.match_id = p_match_id
        and s.revision > p_last_revision
        and s.ping_index <= v_match.last_ping_index
      order by s.runner_id, s.revision desc, s.ping_index desc
    ) latest;
  elsif v_role = 'RUNNER' and v_match.last_ping_index >= 0 then
    select jsonb_build_object('ping_index', s.ping_index, 'ping_at', s.ping_at, 'revision', s.revision)
      into v_runner_notice
      from public.ping_snapshots s
      where s.match_id = p_match_id and s.revision > p_last_revision
      order by s.revision desc limit 1;
  end if;

  if v_match.state in ('HEAD_START', 'ACTIVE')
     and v_match.ping_seconds is not null and v_match.last_ping_index >= -1 then
    v_next_ping_at := v_active_at + make_interval(secs => (v_match.last_ping_index + 1) * v_match.ping_seconds);
    if v_next_ping_at >= v_match.ends_at then v_next_ping_at := null; end if;
  end if;

  return jsonb_build_object(
    'state', v_match.state,
    'server_now', v_server_now,
    'ends_at', v_match.ends_at,
    'revision', v_match.revision,
    'role', v_role,
    'active_counts', jsonb_build_object('hunters', v_hunters, 'runners', v_runners),
    'due_pings', case when v_role = 'HUNTER' then v_due_pings else '[]'::jsonb end,
    'runner_notice', case when v_role = 'RUNNER' then v_runner_notice else null end,
    'next_ping_at', v_next_ping_at
  );
end;
$$;

revoke all on function public.xzones_sync_match(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.xzones_sync_match(uuid, uuid, bigint) to service_role;
