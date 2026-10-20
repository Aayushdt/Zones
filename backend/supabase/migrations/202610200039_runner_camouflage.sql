create or replace function public.xzones_activate_item(
  p_auth_user_id uuid,p_match_id uuid,p_item_key text,p_scan_seconds integer,p_max_fix_age_seconds integer,
  p_alarm_radius_m integer,p_alarm_seconds integer,p_hunter_fix_max_age_seconds integer,
  p_zone_move_max_m integer,p_zone_move_overlap_percent integer,p_decoy_max_offset_m integer,p_ping_max_fix_age_seconds integer,
  p_shield_seconds integer,p_camouflage_seconds integer,p_camouflage_marker boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; own_player uuid; expiry timestamptz; filtered jsonb;
begin
  if p_item_key='RUNNER_CAMOUFLAGE' then
    result:=public.xzones_activate_item(p_auth_user_id,p_match_id,p_item_key,p_scan_seconds,p_max_fix_age_seconds,p_alarm_radius_m,p_alarm_seconds,p_hunter_fix_max_age_seconds,p_zone_move_max_m,p_zone_move_overlap_percent,p_decoy_max_offset_m,p_ping_max_fix_age_seconds);
    if result->>'accepted'<>'true' then return result; end if;
    select id into own_player from public.players where match_id=p_match_id and auth_user_id=p_auth_user_id and role='RUNNER' and status='ACTIVE';
    if own_player is null then return jsonb_build_object('error','ITEM_UNAVAILABLE'); end if;
    expiry:=clock_timestamp()+make_interval(secs=>p_camouflage_seconds);
    update public.item_uses set active_until=expiry where match_id=p_match_id and player_id=own_player and item_key='RUNNER_CAMOUFLAGE';
    return jsonb_build_object('accepted',true,'uses_remaining',result->'uses_remaining','active_until',expiry);
  end if;
  result:=public.xzones_activate_item(p_auth_user_id,p_match_id,p_item_key,p_scan_seconds,p_max_fix_age_seconds,p_alarm_radius_m,p_alarm_seconds,p_hunter_fix_max_age_seconds,p_zone_move_max_m,p_zone_move_overlap_percent,p_decoy_max_offset_m,p_ping_max_fix_age_seconds,p_shield_seconds,p_camouflage_seconds);
  if p_item_key='HUNTER_SCAN' and result->>'accepted'='true' then
    select coalesce(jsonb_agg(e),'[]'::jsonb) into filtered
      from jsonb_array_elements(coalesce(result->'runner_positions','[]'::jsonb)) e
      where not exists(select 1 from public.item_uses u where u.match_id=p_match_id and u.item_key='RUNNER_CAMOUFLAGE' and u.active_until>clock_timestamp() and u.player_id=(e->>'runner_id')::uuid);
    result:=jsonb_set(result,'{runner_positions}',filtered);
  end if;
  return result;
end $$;

create or replace function public.xzones_hide_camouflaged_ping() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.item_uses u where u.match_id=new.match_id and u.player_id=new.runner_id and u.item_key='RUNNER_CAMOUFLAGE' and u.active_until>new.received_at) then
    delete from public.ping_snapshots where match_id=new.match_id and runner_id=new.runner_id and ping_index=new.ping_index;
    return null;
  end if;
  return null;
end $$;
drop trigger if exists xzones_hide_camouflaged_ping on public.ping_snapshots;
create trigger xzones_hide_camouflaged_ping after insert on public.ping_snapshots for each row execute function public.xzones_hide_camouflaged_ping();
revoke all on function public.xzones_activate_item(uuid,uuid,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,boolean) from public,anon,authenticated;
revoke all on function public.xzones_hide_camouflaged_ping() from public,anon,authenticated;
grant execute on function public.xzones_activate_item(uuid,uuid,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,boolean) to service_role;
