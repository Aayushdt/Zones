create or replace function public.xzones_enforce_player_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_player_count integer;
begin
  if new.status <> 'ACTIVE' then return new; end if;

  perform 1 from public.matches where id = new.match_id for update;
  select count(*) into v_player_count
    from public.players
    where match_id = new.match_id and status = 'ACTIVE'
      and (tg_op = 'INSERT' or id <> new.id);
  if v_player_count >= 100 then
    raise exception using errcode = '23514', message = 'LOBBY_FULL';
  end if;
  return new;
end;
$$;

revoke all on function public.xzones_enforce_player_limit() from public, anon, authenticated;

drop trigger if exists xzones_player_limit_guard on public.players;
create trigger xzones_player_limit_guard
  before insert or update of status, match_id on public.players
  for each row execute function public.xzones_enforce_player_limit();

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
  v_existing_removed boolean;
  v_user_ok boolean;
  v_ip_ok boolean;
begin
  v_user_ok := public.xzones_consume_rate_limit(p_user_bucket_key, 'join_user_hour', 3600, 10);
  v_ip_ok := public.xzones_consume_rate_limit(p_failed_bucket_key, 'join_ip_10m', 600, 5);
  if not v_user_ok or not v_ip_ok then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;

  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 24
     or octet_length(p_code_hash) <> 32 or octet_length(p_session_cap_hash) <> 32 then
    return jsonb_build_object('error', 'INVALID_INPUT');
  end if;

  select * into v_match from public.matches where code_hash = p_code_hash for update;
  if not found or v_match.expires_at <= now() then
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;
  if v_match.state <> 'LOBBY' then return jsonb_build_object('error', 'MATCH_STARTED'); end if;

  select removed_from_lobby into v_existing_removed from public.players
    where match_id = v_match.id and auth_user_id = p_auth_user_id;
  if found then
    if v_existing_removed then return jsonb_build_object('error', 'REMOVED_FROM_LOBBY'); end if;
    return jsonb_build_object('error', 'ALREADY_MEMBER');
  end if;

  select count(*) into v_player_count from public.players where match_id = v_match.id and status = 'ACTIVE';
  if v_player_count >= 100 then return jsonb_build_object('error', 'LOBBY_FULL'); end if;

  insert into public.players (id, match_id, auth_user_id, display_name, session_cap_hash)
  values (v_player_id, v_match.id, p_auth_user_id, btrim(p_display_name), p_session_cap_hash);
  update public.matches set revision = revision + 1 where id = v_match.id;
  return jsonb_build_object('match_id', v_match.id, 'player_id', v_player_id, 'role', null);
end;
$$;

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
  v_target_hunters integer;
  v_block_reason text;
begin
  select count(*),
         count(*) filter (where role = 'HUNTER'),
         count(*) filter (where role = 'RUNNER'),
         count(*) filter (where role is null),
         coalesce(bool_and(ready), false)
    into v_players, v_hunters, v_runners, v_unassigned, v_everyone_ready
    from public.players where match_id = p_match_id and status = 'ACTIVE';

  v_target_hunters := least(greatest(ceil(v_players::numeric / 10)::integer, 1), floor(v_players::numeric / 2)::integer);
  v_block_reason := case
    when v_players < 2 then 'NEEDS_TWO_PLAYERS'
    when v_players > 100 then 'LOBBY_FULL'
    when v_unassigned > 0 or v_runners = 0 or v_hunters <> v_target_hunters then 'NEEDS_TEAMS'
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

revoke all on function public.xzones_join_lobby(uuid, bytea, bytea, text, bytea, bytea) from public, anon, authenticated;
revoke all on function public.xzones_lobby_status(uuid) from public, anon, authenticated;
grant execute on function public.xzones_join_lobby(uuid, bytea, bytea, text, bytea, bytea) to service_role;
grant execute on function public.xzones_lobby_status(uuid) to service_role;
