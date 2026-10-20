create or replace function public.xzones_activate_item(
  p_auth_user_id uuid,p_match_id uuid,p_item_key text,p_scan_seconds integer,p_max_fix_age_seconds integer,
  p_alarm_radius_m integer,p_alarm_seconds integer,p_hunter_fix_max_age_seconds integer,
  p_zone_move_max_m integer,p_zone_move_overlap_percent integer,p_decoy_max_offset_m integer,p_ping_max_fix_age_seconds integer,
  p_shield_seconds integer,p_camouflage_seconds integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; own_player uuid; expiry timestamptz;
begin
  if p_shield_seconds not between 10 and 600 or p_camouflage_seconds not between 5 and 180 then return jsonb_build_object('error','INVALID_INPUT'); end if;
  result:=public.xzones_activate_item(p_auth_user_id,p_match_id,p_item_key,p_scan_seconds,p_max_fix_age_seconds,p_alarm_radius_m,p_alarm_seconds,p_hunter_fix_max_age_seconds,p_zone_move_max_m,p_zone_move_overlap_percent,p_decoy_max_offset_m,p_ping_max_fix_age_seconds);
  if result->>'accepted'<>'true' or p_item_key<>'RUNNER_ZONE_SHIELD' then return result; end if;
  select id into own_player from public.players where match_id=p_match_id and auth_user_id=p_auth_user_id and role='RUNNER' and status='ACTIVE';
  if own_player is null then return jsonb_build_object('error','ITEM_UNAVAILABLE'); end if;
  expiry:=clock_timestamp()+make_interval(secs=>p_shield_seconds);
  update public.item_uses set active_until=expiry where match_id=p_match_id and player_id=own_player and item_key='RUNNER_ZONE_SHIELD';
  return jsonb_build_object('accepted',true,'uses_remaining',result->'uses_remaining','active_until',expiry);
end $$;

create or replace function public.xzones_track_zone_sample() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_zone jsonb; v_center jsonb; v_radius double precision; v_distance double precision; v_since timestamptz; v_count integer; v_role public.player_role;
begin
  if exists(select 1 from public.item_uses u where u.match_id=new.match_id and u.player_id=new.player_id and u.item_key='RUNNER_ZONE_SHIELD' and u.active_until>new.received_at) then return new; end if;
  v_zone:=public.xzones_zone_at(new.match_id,new.received_at); if coalesce((v_zone->>'enabled')::boolean,false) is not true then return new; end if;
  select role into v_role from public.players where id=new.player_id and match_id=new.match_id and status='ACTIVE'; if v_role is distinct from 'RUNNER'::public.player_role then return new; end if;
  v_center:=v_zone->'center'; v_radius:=(v_zone->>'radius')::double precision;
  v_distance:=6371000*2*asin(sqrt(power(sin(radians(new.lat-(v_center->>'lat')::double precision)/2),2)+cos(radians((v_center->>'lat')::double precision))*cos(radians(new.lat))*power(sin(radians(new.lon-(v_center->>'lon')::double precision)/2),2)));
  if v_distance-new.accuracy_m>v_radius then
    update public.players set zone_outside_samples=least(2,zone_outside_samples+1),zone_outside_since=coalesce(zone_outside_since,new.received_at) where id=new.player_id returning zone_outside_samples,zone_outside_since into v_count,v_since;
    if v_count>=2 then update public.players set zone_revealed_at=coalesce(zone_revealed_at,new.received_at) where id=new.player_id; end if;
    if new.received_at>=v_since+interval '120 seconds' then update public.players set status='TAGGED',ready=false where id=new.player_id and status='ACTIVE'; delete from public.latest_fix where match_id=new.match_id and player_id=new.player_id;
    elsif new.received_at>=v_since+interval '30 seconds' then update public.players set zone_warning_at=coalesce(zone_warning_at,new.received_at) where id=new.player_id; end if;
  else update public.players set zone_outside_samples=0,zone_outside_since=null,zone_warning_at=null where id=new.player_id; end if;
  return new;
end $$;
revoke all on function public.xzones_activate_item(uuid,uuid,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.xzones_activate_item(uuid,uuid,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer) to service_role;
