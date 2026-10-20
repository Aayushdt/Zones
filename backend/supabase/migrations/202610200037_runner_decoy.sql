create or replace function public.xzones_activate_item(
  p_auth_user_id uuid, p_match_id uuid, p_item_key text,
  p_scan_seconds integer, p_max_fix_age_seconds integer,
  p_alarm_radius_m integer, p_alarm_seconds integer, p_hunter_fix_max_age_seconds integer,
  p_zone_move_max_m integer, p_zone_move_overlap_percent integer,
  p_decoy_max_offset_m integer, p_ping_max_fix_age_seconds integer
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; m public.matches%rowtype; own_player uuid; fix public.latest_fix%rowtype;
  next_index integer; offset_m double precision; angle double precision; decoy_lat double precision; decoy_lon double precision;
begin
  if p_decoy_max_offset_m not between 1 and 500 or p_ping_max_fix_age_seconds not between 1 and 300 then
    return jsonb_build_object('error','INVALID_INPUT');
  end if;
  if p_item_key='RUNNER_DECOY' then
    select * into m from public.matches where id=p_match_id;
    select id into own_player from public.players where match_id=p_match_id and auth_user_id=p_auth_user_id and role='RUNNER' and status='ACTIVE';
    select * into fix from public.latest_fix where match_id=p_match_id and player_id=own_player
      and captured_at>clock_timestamp()-make_interval(secs=>p_ping_max_fix_age_seconds);
    if m.id is null or own_player is null or fix.player_id is null or m.state<>'ACTIVE' or not m.items_enabled or m.ping_seconds is null or m.head_start_ends_at is null then
      return jsonb_build_object('error','ITEM_UNAVAILABLE');
    end if;
  end if;
  result:=public.xzones_activate_item(p_auth_user_id,p_match_id,p_item_key,p_scan_seconds,p_max_fix_age_seconds,p_alarm_radius_m,p_alarm_seconds,p_hunter_fix_max_age_seconds,p_zone_move_max_m,p_zone_move_overlap_percent);
  if result->>'accepted'<>'true' or p_item_key<>'RUNNER_DECOY' then return result; end if;
  next_index:=greatest(m.last_ping_index+1, floor(extract(epoch from (clock_timestamp()-m.head_start_ends_at))/m.ping_seconds)::integer);
  offset_m:=p_decoy_max_offset_m*sqrt(random()); angle:=random()*2*pi();
  decoy_lat:=fix.lat+(offset_m*cos(angle))/111320.0;
  decoy_lon:=fix.lon+(offset_m*sin(angle))/(111320.0*cos(radians(fix.lat)));
  insert into public.ping_snapshots(match_id,runner_id,ping_index,status,lat,lon,accuracy_m,captured_at,ping_at,age_seconds,received_at,revision)
  values(p_match_id,own_player,next_index,'OK',decoy_lat,decoy_lon,fix.accuracy_m,fix.captured_at,
    m.head_start_ends_at+make_interval(secs=>next_index*m.ping_seconds),0,clock_timestamp(),m.revision+1)
  on conflict (match_id,runner_id,ping_index) do nothing;
  return jsonb_build_object('accepted',true,'uses_remaining',result->'uses_remaining','ping_index',next_index);
end $$;

revoke all on function public.xzones_activate_item(uuid,uuid,text,integer,integer,integer,integer,integer,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.xzones_activate_item(uuid,uuid,text,integer,integer,integer,integer,integer,integer,integer,integer,integer) to service_role;
