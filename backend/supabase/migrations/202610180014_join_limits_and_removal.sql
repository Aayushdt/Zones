alter table public.players
  add column removed_from_lobby boolean not null default false;

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
  -- Both privacy buckets are consumed for every attempt before code lookup.
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
  if v_player_count >= 12 then return jsonb_build_object('error', 'LOBBY_FULL'); end if;

  insert into public.players (id, match_id, auth_user_id, display_name, session_cap_hash)
  values (v_player_id, v_match.id, p_auth_user_id, btrim(p_display_name), p_session_cap_hash);
  update public.matches set revision = revision + 1 where id = v_match.id;
  return jsonb_build_object('match_id', v_match.id, 'player_id', v_player_id, 'role', null);
end;
$$;

create or replace function public.xzones_remove_lobby_player(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_player_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_host_id uuid;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state <> 'LOBBY' then return jsonb_build_object('error', 'INVALID_STATE'); end if;
  select id into v_host_id from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id
      and id = v_match.controller_player_id and status = 'ACTIVE';
  if not found then return jsonb_build_object('error', 'NOT_HOST'); end if;
  if p_player_id = v_host_id then return jsonb_build_object('error', 'CANNOT_REMOVE_SELF'); end if;

  update public.players set status = 'LEFT', ready = false, removed_from_lobby = true
    where match_id = p_match_id and id = p_player_id and status = 'ACTIVE';
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  update public.matches set revision = revision + 1 where id = p_match_id;
  return jsonb_build_object('accepted', true, 'player_id', p_player_id, 'state', 'LOBBY');
end;
$$;

revoke all on function public.xzones_join_lobby(uuid, bytea, bytea, text, bytea, bytea) from public, anon, authenticated;
grant execute on function public.xzones_join_lobby(uuid, bytea, bytea, text, bytea, bytea) to service_role;
revoke all on function public.xzones_remove_lobby_player(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.xzones_remove_lobby_player(uuid, uuid, uuid) to service_role;
