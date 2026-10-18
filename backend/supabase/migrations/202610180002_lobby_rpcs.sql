create or replace function public.xzones_consume_rate_limit(
  p_bucket_key bytea,
  p_action text,
  p_window_seconds integer,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_window timestamptz;
  v_attempts integer;
begin
  if octet_length(p_bucket_key) <> 32
     or p_window_seconds < 1
     or p_limit < 1
     or char_length(p_action) not between 1 and 40 then
    raise exception 'INVALID_RATE_LIMIT_INPUT' using errcode = '22023';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket_key, action, window_started_at, attempts, expires_at)
  values (p_bucket_key, p_action, v_window, 1, v_window + make_interval(secs => p_window_seconds))
  on conflict (bucket_key, action, window_started_at)
  do update set attempts = public.rate_limits.attempts + 1
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end;
$$;

create or replace function public.xzones_create_lobby(
  p_auth_user_id uuid,
  p_bucket_key bytea,
  p_display_name text,
  p_code_hash bytea,
  p_session_cap_hash bytea,
  p_round_seconds integer,
  p_head_start_seconds integer,
  p_ping_seconds integer,
  p_zone_lat double precision,
  p_zone_lon double precision,
  p_zone_diameter_m integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match_id uuid := gen_random_uuid();
  v_player_id uuid := gen_random_uuid();
  v_code_expires_at timestamptz := now() + interval '2 hours';
begin
  if not public.xzones_consume_rate_limit(p_bucket_key, 'create_user_hour', 3600, 5) then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;

  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 24
     or octet_length(p_code_hash) <> 32 or octet_length(p_session_cap_hash) <> 32
     or p_round_seconds not between 600 and 10800
     or p_head_start_seconds not between 0 and 900
     or p_ping_seconds not between 60 and 1800
     or (p_zone_diameter_m is not null and (
       p_zone_diameter_m not between 400 and 3000 or p_zone_diameter_m % 2 <> 0
     ))
     or ((p_zone_lat is null) <> (p_zone_lon is null))
     or (p_zone_lat is not null and (p_zone_lat not between -90 and 90 or p_zone_lon not between -180 and 180)) then
    return jsonb_build_object('error', 'INVALID_CONFIG');
  end if;

  insert into public.matches (
    id, code_hash, round_seconds, head_start_seconds, ping_seconds,
    zone_lat, zone_lon, zone_radius_m, expires_at
  ) values (
    v_match_id, p_code_hash, p_round_seconds, p_head_start_seconds, p_ping_seconds,
    p_zone_lat, p_zone_lon, case when p_zone_diameter_m is null then null else p_zone_diameter_m / 2 end,
    v_code_expires_at
  );

  insert into public.players (id, match_id, auth_user_id, display_name, session_cap_hash)
  values (v_player_id, v_match_id, p_auth_user_id, btrim(p_display_name), p_session_cap_hash);

  update public.matches
    set host_player_id = v_player_id, controller_player_id = v_player_id
    where id = v_match_id;

  return jsonb_build_object(
    'match_id', v_match_id,
    'player_id', v_player_id,
    'code_expires_at', v_code_expires_at
  );
exception when unique_violation then
  return jsonb_build_object('error', 'CODE_COLLISION');
end;
$$;

create or replace function public.xzones_join_lobby(
  p_auth_user_id uuid,
  p_user_bucket_key bytea,
  p_failed_bucket_key bytea,
  p_display_name text,
  p_code_hash bytea,
  p_session_cap_hash bytea
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player_id uuid := gen_random_uuid();
  v_player_count integer;
begin
  if not public.xzones_consume_rate_limit(p_user_bucket_key, 'join_user_hour', 3600, 10) then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;

  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 24
     or octet_length(p_code_hash) <> 32 or octet_length(p_session_cap_hash) <> 32 then
    return jsonb_build_object('error', 'INVALID_INPUT');
  end if;

  select * into v_match from public.matches
    where code_hash = p_code_hash for update;

  if not found or v_match.expires_at <= now() then
    if not public.xzones_consume_rate_limit(p_failed_bucket_key, 'join_failed_10m', 600, 5) then
      return jsonb_build_object('error', 'RATE_LIMITED');
    end if;
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;
  if v_match.state <> 'LOBBY' then
    return jsonb_build_object('error', 'MATCH_STARTED');
  end if;

  select count(*) into v_player_count from public.players
    where match_id = v_match.id and status <> 'LEFT';
  if v_player_count >= 12 then
    return jsonb_build_object('error', 'LOBBY_FULL');
  end if;

  if exists (select 1 from public.players where match_id = v_match.id and auth_user_id = p_auth_user_id) then
    return jsonb_build_object('error', 'ALREADY_MEMBER');
  end if;

  insert into public.players (id, match_id, auth_user_id, display_name, session_cap_hash)
  values (v_player_id, v_match.id, p_auth_user_id, btrim(p_display_name), p_session_cap_hash);

  update public.matches set revision = revision + 1 where id = v_match.id;
  return jsonb_build_object('match_id', v_match.id, 'player_id', v_player_id, 'role', null);
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
  v_runners integer;
  v_target_hunters integer;
  v_role public.player_role;
  v_can_start boolean;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state <> 'LOBBY' then return jsonb_build_object('error', 'INVALID_STATE'); end if;

  select * into v_player from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE' for update;
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;

  select count(*), count(*) filter (where role = 'HUNTER'), count(*) filter (where role = 'RUNNER')
    into v_players, v_hunters, v_runners
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
  if v_role = 'HUNTER' then v_hunters := v_hunters + 1; else v_runners := v_runners + 1; end if;
  v_players := v_players + 1;
  select bool_and(ready) into v_can_start from public.players where match_id = p_match_id and status = 'ACTIVE';
  v_can_start := coalesce(v_can_start, false) and v_players between 3 and 12 and v_hunters > 0 and v_runners > 0;

  update public.matches set revision = revision + 1 where id = p_match_id;
  return jsonb_build_object('role', v_role, 'counts', jsonb_build_object('hunters', v_hunters, 'runners', v_runners), 'can_start', v_can_start);
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
  v_player_id uuid;
  v_players integer;
  v_hunters integer;
  v_runners integer;
  v_everyone_ready boolean;
  v_can_start boolean;
  v_block_reason text;
begin
  if not exists (select 1 from public.matches where id = p_match_id and state = 'LOBBY' for update) then
    return jsonb_build_object('error', 'INVALID_STATE');
  end if;

  select id into v_player_id from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE' for update;
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;

  update public.players set ready = p_ready where id = v_player_id;
  select count(*), count(*) filter (where role = 'HUNTER'), count(*) filter (where role = 'RUNNER'), bool_and(ready)
    into v_players, v_hunters, v_runners, v_everyone_ready
    from public.players where match_id = p_match_id and status = 'ACTIVE';

  v_can_start := v_players between 3 and 12 and v_hunters > 0 and v_runners > 0 and coalesce(v_everyone_ready, false);
  v_block_reason := case
    when v_players < 3 then 'NEEDS_THREE_PLAYERS'
    when v_players > 12 then 'LOBBY_FULL'
    when v_hunters = 0 or v_runners = 0 then 'NEEDS_TEAMS'
    when not coalesce(v_everyone_ready, false) then 'WAITING_FOR_READY'
    else null end;

  update public.matches set revision = revision + 1 where id = p_match_id;
  return jsonb_build_object('ready', p_ready, 'can_start', v_can_start, 'block_reason', v_block_reason);
end;
$$;

revoke all on function public.xzones_consume_rate_limit(bytea, text, integer, integer) from public, anon, authenticated;
revoke all on function public.xzones_create_lobby(uuid, bytea, text, bytea, bytea, integer, integer, integer, double precision, double precision, integer) from public, anon, authenticated;
revoke all on function public.xzones_join_lobby(uuid, bytea, bytea, text, bytea, bytea) from public, anon, authenticated;
revoke all on function public.xzones_select_team(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.xzones_set_ready(uuid, uuid, boolean) from public, anon, authenticated;

grant execute on function public.xzones_consume_rate_limit(bytea, text, integer, integer) to service_role;
grant execute on function public.xzones_create_lobby(uuid, bytea, text, bytea, bytea, integer, integer, integer, double precision, double precision, integer) to service_role;
grant execute on function public.xzones_join_lobby(uuid, bytea, bytea, text, bytea, bytea) to service_role;
grant execute on function public.xzones_select_team(uuid, uuid, text) to service_role;
grant execute on function public.xzones_set_ready(uuid, uuid, boolean) to service_role;
