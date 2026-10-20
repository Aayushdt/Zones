alter function public.xzones_scan_qr(uuid, uuid, bytea) rename to xzones_scan_qr_unchecked;

create function public.xzones_scan_qr(
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
  v_hunter_id uuid;
  v_runner_id uuid;
  v_hunter_fix public.latest_fix%rowtype;
  v_runner_fix public.latest_fix%rowtype;
  v_now timestamptz := clock_timestamp();
  v_distance double precision;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  select id into v_hunter_id from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and role = 'HUNTER' and status = 'ACTIVE';
  if not found then return jsonb_build_object('error', 'WRONG_ROLE'); end if;
  select runner_id into v_runner_id from public.qr_challenges
    where token_hash = p_token_hash and match_id = p_match_id and used_at is null and expires_at > v_now;
  if v_runner_id is null then return public.xzones_scan_qr_unchecked(p_auth_user_id, p_match_id, p_token_hash); end if;
  select * into v_hunter_fix from public.latest_fix
    where match_id = p_match_id and player_id = v_hunter_id
      and captured_at >= v_now - interval '30 seconds' and captured_at <= v_now;
  select * into v_runner_fix from public.latest_fix
    where match_id = p_match_id and player_id = v_runner_id
      and captured_at >= v_now - interval '30 seconds' and captured_at <= v_now;
  if v_hunter_fix.player_id is not null and v_runner_fix.player_id is not null then
    v_distance := 6371000 * 2 * asin(sqrt(
      power(sin(radians(v_runner_fix.lat - v_hunter_fix.lat) / 2), 2)
      + cos(radians(v_hunter_fix.lat)) * cos(radians(v_runner_fix.lat))
      * power(sin(radians(v_runner_fix.lon - v_hunter_fix.lon) / 2), 2)
    ));
    if v_distance > 100 then return jsonb_build_object('error', 'QR_RELAY_BLOCKED'); end if;
  end if;
  return public.xzones_scan_qr_unchecked(p_auth_user_id, p_match_id, p_token_hash);
end;
$$;

revoke all on function public.xzones_scan_qr(uuid, uuid, bytea) from public, anon, authenticated;
grant execute on function public.xzones_scan_qr(uuid, uuid, bytea) to service_role;
revoke all on function public.xzones_scan_qr_unchecked(uuid, uuid, bytea) from public, anon, authenticated;
