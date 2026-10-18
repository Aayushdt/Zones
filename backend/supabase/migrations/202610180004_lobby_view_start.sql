create or replace function public.xzones_lobby_status(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_players integer;
  v_hunters integer;
  v_runners integer;
  v_unassigned integer;
  v_everyone_ready boolean;
  v_min_hunters integer;
  v_max_hunters integer;
  v_block_reason text;
begin
  select count(*),
         count(*) filter (where role = 'HUNTER'),
         count(*) filter (where role = 'RUNNER'),
         count(*) filter (where role is null),
         coalesce(bool_and(ready), false)
    into v_players, v_hunters, v_runners, v_unassigned, v_everyone_ready
    from public.players where match_id = p_match_id and status = 'ACTIVE';

  v_min_hunters := ceil(v_players::numeric / 10)::integer;
  v_max_hunters := floor(v_players::numeric / 2)::integer;
  v_block_reason := case
    when v_players < 3 then 'NEEDS_THREE_PLAYERS'
    when v_players > 12 then 'LOBBY_FULL'
    when v_unassigned > 0 or v_runners = 0 or v_hunters < v_min_hunters or v_hunters > v_max_hunters then 'NEEDS_TEAMS'
    when not v_everyone_ready then 'WAITING_FOR_READY'
    else null
  end;

  return jsonb_build_object(
    'active_counts', jsonb_build_object('hunters', v_hunters, 'runners', v_runners),
    'player_count', v_players,
    'can_start', v_block_reason is null,
    'block_reason', v_block_reason
  );
end;
$$;

create or replace function public.xzones_sync_lobby(
  p_auth_user_id uuid,
  p_match_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player public.players%rowtype;
  v_status jsonb;
  v_players jsonb;
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state <> 'LOBBY' then return jsonb_build_object('error', 'NOT_LOBBY'); end if;

  select * into v_player from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE';
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;

  v_status := public.xzones_lobby_status(p_match_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'role', p.role,
    'ready', p.ready,
    'status', p.status
  ) order by p.joined_at, p.id), '[]'::jsonb)
  into v_players
  from public.players p where p.match_id = p_match_id and p.status = 'ACTIVE';

  return jsonb_build_object(
    'state', 'LOBBY',
    'server_now', clock_timestamp(),
    'revision', v_match.revision,
    'role', v_player.role,
    'own_player_id', v_player.id,
    'host_player_id', v_match.host_player_id,
    'controller_player_id', v_match.controller_player_id,
    'players', v_players,
    'active_counts', v_status->'active_counts',
    'can_start', v_status->'can_start',
    'block_reason', v_status->'block_reason'
  );
end;
$$;

create or replace function public.xzones_select_team(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_role text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player public.players%rowtype;
  v_players integer;
  v_hunters integer;
  v_target_hunters integer;
  v_role public.player_role;
  v_status jsonb;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state <> 'LOBBY' then return jsonb_build_object('error', 'INVALID_STATE'); end if;

  select * into v_player from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE' for update;
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;

  select count(*), count(*) filter (where role = 'HUNTER')
    into v_players, v_hunters
    from public.players where match_id = p_match_id and status = 'ACTIVE' and id <> v_player.id;

  v_target_hunters := least(greatest(ceil((v_players + 1)::numeric / 10)::integer, 1), floor((v_players + 1)::numeric / 2)::integer);
  if p_role = 'RANDOM' then
    v_role := case when v_hunters < v_target_hunters then 'HUNTER'::public.player_role else 'RUNNER'::public.player_role end;
  elsif p_role in ('HUNTER', 'RUNNER') then
    v_role := p_role::public.player_role;
  else
    return jsonb_build_object('error', 'INVALID_ROLE');
  end if;

  update public.players set role = v_role, ready = false where id = v_player.id;
  update public.matches set revision = revision + 1 where id = p_match_id;
  v_status := public.xzones_lobby_status(p_match_id);
  return jsonb_build_object(
    'role', v_role,
    'counts', v_status->'active_counts',
    'can_start', v_status->'can_start',
    'block_reason', v_status->'block_reason'
  );
end;
$$;

create or replace function public.xzones_set_ready(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_ready boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player_id uuid;
  v_status jsonb;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state <> 'LOBBY' then return jsonb_build_object('error', 'INVALID_STATE'); end if;

  select id into v_player_id from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE' for update;
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;

  update public.players set ready = p_ready where id = v_player_id;
  update public.matches set revision = revision + 1 where id = p_match_id;
  v_status := public.xzones_lobby_status(p_match_id);
  return jsonb_build_object(
    'ready', p_ready,
    'can_start', v_status->'can_start',
    'block_reason', v_status->'block_reason'
  );
end;
$$;

create or replace function public.xzones_start_match(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_expected_revision bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player_id uuid;
  v_status jsonb;
  v_now timestamptz := clock_timestamp();
  v_head_start_ends_at timestamptz;
  v_ends_at timestamptz;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state <> 'LOBBY' then return jsonb_build_object('error', 'INVALID_STATE'); end if;
  if v_match.revision <> p_expected_revision then return jsonb_build_object('error', 'REVISION_CONFLICT'); end if;

  select id into v_player_id from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE';
  if not found or v_player_id <> v_match.controller_player_id then
    return jsonb_build_object('error', 'NOT_HOST');
  end if;

  v_status := public.xzones_lobby_status(p_match_id);
  if v_status->>'can_start' <> 'true' then
    return jsonb_build_object('error', 'NOT_READY', 'block_reason', v_status->>'block_reason');
  end if;

  v_head_start_ends_at := v_now + make_interval(secs => v_match.head_start_seconds);
  v_ends_at := v_now + make_interval(secs => v_match.round_seconds);
  update public.matches set
    state = 'HEAD_START', started_at = v_now, head_start_ends_at = v_head_start_ends_at,
    ends_at = v_ends_at, revision = revision + 1
  where id = p_match_id;

  return jsonb_build_object(
    'state', 'HEAD_START',
    'start_at', v_now,
    'head_start_ends_at', v_head_start_ends_at,
    'ends_at', v_ends_at,
    'revision', v_match.revision + 1
  );
end;
$$;

revoke all on function public.xzones_lobby_status(uuid) from public, anon, authenticated;
revoke all on function public.xzones_sync_lobby(uuid, uuid) from public, anon, authenticated;
revoke all on function public.xzones_select_team(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.xzones_set_ready(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.xzones_start_match(uuid, uuid, bigint) from public, anon, authenticated;

grant execute on function public.xzones_lobby_status(uuid) to service_role;
grant execute on function public.xzones_sync_lobby(uuid, uuid) to service_role;
grant execute on function public.xzones_select_team(uuid, uuid, text) to service_role;
grant execute on function public.xzones_set_ready(uuid, uuid, boolean) to service_role;
grant execute on function public.xzones_start_match(uuid, uuid, bigint) to service_role;
