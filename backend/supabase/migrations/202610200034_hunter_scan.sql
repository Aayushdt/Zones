create or replace function public.xzones_activate_item(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_item_key text,
  p_scan_seconds integer,
  p_max_fix_age_seconds integer
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  result jsonb;
  own_player uuid;
  runner_positions jsonb;
  expiry timestamptz;
begin
  if p_scan_seconds not between 5 and 120 or p_max_fix_age_seconds not between 1 and 300 then
    return jsonb_build_object('error','INVALID_INPUT');
  end if;
  result := public.xzones_activate_item(p_auth_user_id, p_match_id, p_item_key);
  if result->>'accepted' <> 'true' or p_item_key <> 'HUNTER_SCAN' then return result; end if;
  select id into own_player from public.players
    where match_id=p_match_id and auth_user_id=p_auth_user_id and role='HUNTER' and status='ACTIVE';
  if own_player is null then return jsonb_build_object('error','ITEM_UNAVAILABLE'); end if;
  expiry := clock_timestamp() + make_interval(secs => p_scan_seconds);
  update public.item_uses set active_until=expiry
    where match_id=p_match_id and player_id=own_player and item_key='HUNTER_SCAN';
  select coalesce(jsonb_agg(jsonb_build_object(
    'runner_id', p.id, 'lat', f.lat, 'lon', f.lon, 'captured_at', f.captured_at,
    'age_seconds', greatest(0, floor(extract(epoch from (clock_timestamp()-f.captured_at)))::integer)
  ) order by p.id),'[]'::jsonb) into runner_positions
  from public.players p join public.latest_fix f on f.match_id=p.match_id and f.player_id=p.id
  where p.match_id=p_match_id and p.role='RUNNER' and p.status='ACTIVE'
    and f.captured_at > clock_timestamp()-make_interval(secs => p_max_fix_age_seconds);
  return jsonb_build_object('accepted',true,'uses_remaining',result->'uses_remaining',
    'scan_until',expiry,'runner_positions',runner_positions);
end $$;

revoke all on function public.xzones_activate_item(uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.xzones_activate_item(uuid,uuid,text,integer,integer) to service_role;
