create or replace function public.xzones_activate_item(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_item_key text,
  p_scan_seconds integer,
  p_max_fix_age_seconds integer,
  p_alarm_radius_m integer,
  p_alarm_seconds integer,
  p_hunter_fix_max_age_seconds integer,
  p_zone_move_max_m integer,
  p_zone_move_overlap_percent integer
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  result jsonb;
  m public.matches%rowtype;
  own_player uuid;
  max_shift double precision;
  shift_m double precision;
  angle double precision;
  next_lat double precision;
  next_lon double precision;
begin
  if p_zone_move_max_m not between 10 and 1000 or p_zone_move_overlap_percent not between 50 and 100 then
    return jsonb_build_object('error','INVALID_INPUT');
  end if;
  if p_item_key='HUNTER_ZONE_MOVER' then
    select * into m from public.matches where id=p_match_id;
    select id into own_player from public.players where match_id=p_match_id and auth_user_id=p_auth_user_id
      and role='HUNTER' and status='ACTIVE';
    if m.id is null or own_player is null or m.state<>'ACTIVE' or not m.items_enabled or m.zone_lat is null then
      return jsonb_build_object('error','ITEM_UNAVAILABLE');
    end if;
  end if;
  result:=public.xzones_activate_item(p_auth_user_id,p_match_id,p_item_key,p_scan_seconds,p_max_fix_age_seconds,
    p_alarm_radius_m,p_alarm_seconds,p_hunter_fix_max_age_seconds);
  if result->>'accepted'<>'true' or p_item_key<>'HUNTER_ZONE_MOVER' then return result; end if;
  max_shift:=least(p_zone_move_max_m,m.zone_radius_m*(1-p_zone_move_overlap_percent/100.0));
  shift_m:=max_shift*sqrt(random());
  angle:=random()*2*pi();
  next_lat:=greatest(-89.999999,least(89.999999,m.zone_lat+(shift_m*cos(angle))/111320.0));
  next_lon:=greatest(-180.0,least(180.0,m.zone_lon+(shift_m*sin(angle))/(111320.0*cos(radians(m.zone_lat)))));
  update public.matches set zone_lat=next_lat,zone_lon=next_lon,revision=revision+1 where id=p_match_id;
  update public.item_uses set private_state=jsonb_build_object('zone_moved',true)
    where match_id=p_match_id and player_id=own_player and item_key='HUNTER_ZONE_MOVER';
  return jsonb_build_object('accepted',true,'uses_remaining',result->'uses_remaining',
    'center',jsonb_build_object('lat',next_lat,'lon',next_lon),'radius_m',m.zone_radius_m,'revision',m.revision+1);
end $$;

revoke all on function public.xzones_activate_item(uuid,uuid,text,integer,integer,integer,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.xzones_activate_item(uuid,uuid,text,integer,integer,integer,integer,integer,integer,integer) to service_role;
