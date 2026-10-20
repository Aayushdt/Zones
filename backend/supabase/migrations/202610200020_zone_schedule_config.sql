alter table public.matches
  add column zone_shrink_stages integer not null default 0,
  add column zone_shrink_interval_seconds integer not null default 300,
  add column zone_final_radius_m integer not null default 50,
  add constraint matches_zone_shrink_stages_bounds check (zone_shrink_stages between 0 and 10),
  add constraint matches_zone_shrink_interval_bounds check (zone_shrink_interval_seconds between 60 and 3600),
  add constraint matches_zone_final_radius_bounds check (
    zone_final_radius_m between 50 and coalesce(zone_radius_m, 1500)
  );

drop function public.xzones_create_lobby(uuid, bytea, text, bytea, bytea, integer, integer, integer, double precision, double precision, integer);

create function public.xzones_create_lobby(
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
  p_zone_diameter_m integer,
  p_zone_shrink_stages integer default 0,
  p_zone_shrink_interval_seconds integer default 300,
  p_zone_final_radius_m integer default 50
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match_id uuid := gen_random_uuid();
  v_player_id uuid := gen_random_uuid();
  v_code_expires_at timestamptz := now() + interval '2 hours';
  v_zone_radius_m integer := case when p_zone_diameter_m is null then null else p_zone_diameter_m / 2 end;
begin
  if not public.xzones_consume_rate_limit(p_bucket_key, 'create_user_hour', 3600, 5) then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 24
     or octet_length(p_code_hash) <> 32 or octet_length(p_session_cap_hash) <> 32
     or p_round_seconds not between 600 and 10800
     or p_head_start_seconds not between 0 and 900
     or p_round_seconds - p_head_start_seconds < 300
     or (p_ping_seconds is not null and (p_ping_seconds not between 60 and 1800 or p_ping_seconds > p_round_seconds - p_head_start_seconds))
     or (p_zone_diameter_m is not null and (p_zone_diameter_m not between 400 and 3000 or p_zone_diameter_m % 2 <> 0))
     or ((p_zone_lat is null) <> (p_zone_lon is null))
     or (p_zone_lat is not null and (p_zone_lat not between -90 and 90 or p_zone_lon not between -180 and 180))
     or p_zone_shrink_stages not between 0 and 10
     or p_zone_shrink_interval_seconds not between 60 and 3600
     or p_zone_final_radius_m not between 50 and coalesce(v_zone_radius_m, 1500) then
    return jsonb_build_object('error', 'INVALID_CONFIG');
  end if;
  insert into public.matches (
    id, code_hash, round_seconds, head_start_seconds, ping_seconds,
    zone_lat, zone_lon, zone_radius_m, zone_shrink_stages,
    zone_shrink_interval_seconds, zone_final_radius_m, expires_at
  ) values (
    v_match_id, p_code_hash, p_round_seconds, p_head_start_seconds, p_ping_seconds,
    p_zone_lat, p_zone_lon, v_zone_radius_m, p_zone_shrink_stages,
    p_zone_shrink_interval_seconds, p_zone_final_radius_m, v_code_expires_at
  );
  insert into public.players (id, match_id, auth_user_id, display_name, session_cap_hash)
  values (v_player_id, v_match_id, p_auth_user_id, btrim(p_display_name), p_session_cap_hash);
  update public.matches set host_player_id = v_player_id, controller_player_id = v_player_id where id = v_match_id;
  return jsonb_build_object('match_id', v_match_id, 'player_id', v_player_id, 'code_expires_at', v_code_expires_at);
exception when unique_violation then
  return jsonb_build_object('error', 'CODE_COLLISION');
end;
$$;

revoke all on function public.xzones_create_lobby(uuid, bytea, text, bytea, bytea, integer, integer, integer, double precision, double precision, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.xzones_create_lobby(uuid, bytea, text, bytea, bytea, integer, integer, integer, double precision, double precision, integer, integer, integer, integer) to service_role;
