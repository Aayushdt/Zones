create unique index if not exists item_alerts_one_alarm_per_placer
  on public.item_alerts(match_id,player_id,alert_key);

create or replace function public.xzones_activate_item(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_item_key text,
  p_scan_seconds integer,
  p_max_fix_age_seconds integer,
  p_alarm_radius_m integer,
  p_alarm_seconds integer,
  p_hunter_fix_max_age_seconds integer
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  result jsonb;
  own_player uuid;
  hunter_fix public.latest_fix%rowtype;
  expiry timestamptz;
begin
  if p_scan_seconds not between 5 and 120 or p_max_fix_age_seconds not between 1 and 300
    or p_alarm_radius_m not between 10 and 500 or p_alarm_seconds not between 30 and 1800
    or p_hunter_fix_max_age_seconds not between 1 and 30 then
    return jsonb_build_object('error','INVALID_INPUT');
  end if;
  if p_item_key = 'HUNTER_ALARM' then
    select p.id into own_player from public.players p join public.matches m on m.id=p.match_id
    where p.match_id=p_match_id and p.auth_user_id=p_auth_user_id and p.role='HUNTER'
      and p.status='ACTIVE' and m.state='ACTIVE' and m.items_enabled;
    select * into hunter_fix from public.latest_fix f where f.match_id=p_match_id and f.player_id=own_player
      and f.captured_at > clock_timestamp()-make_interval(secs=>p_hunter_fix_max_age_seconds);
    if own_player is null or hunter_fix.player_id is null then
      return jsonb_build_object('error','ITEM_UNAVAILABLE');
    end if;
  end if;
  result := public.xzones_activate_item(p_auth_user_id,p_match_id,p_item_key,p_scan_seconds,p_max_fix_age_seconds);
  if result->>'accepted' <> 'true' or p_item_key <> 'HUNTER_ALARM' then return result; end if;
  expiry := clock_timestamp()+make_interval(secs=>p_alarm_seconds);
  update public.item_uses set active_until=expiry,
    private_state=jsonb_build_object('alarm_lat',hunter_fix.lat,'alarm_lon',hunter_fix.lon,
      'alarm_radius_m',p_alarm_radius_m,'alerted',false)
  where match_id=p_match_id and player_id=own_player and item_key='HUNTER_ALARM';
  return jsonb_build_object('accepted',true,'uses_remaining',result->'uses_remaining','active_until',expiry);
end $$;

create or replace function public.xzones_evaluate_proximity_alarms()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare alarm record; distance_m double precision;
begin
  if not exists (select 1 from public.players p where p.id=new.player_id and p.match_id=new.match_id
    and p.role='RUNNER' and p.status='ACTIVE') then return new; end if;
  for alarm in
    select u.player_id,u.private_state,u.active_until from public.item_uses u
    join public.matches m on m.id=u.match_id
    where u.match_id=new.match_id and u.item_key='HUNTER_ALARM'
      and m.state='ACTIVE' and m.items_enabled and u.active_until>clock_timestamp()
      and coalesce((u.private_state->>'alerted')::boolean,false)=false
  loop
    distance_m := 6371000 * 2 * asin(sqrt(
      power(sin(radians(new.lat-(alarm.private_state->>'alarm_lat')::double precision)/2),2)
      + cos(radians(new.lat))*cos(radians((alarm.private_state->>'alarm_lat')::double precision))
      * power(sin(radians(new.lon-(alarm.private_state->>'alarm_lon')::double precision)/2),2)
    ));
    if distance_m <= (alarm.private_state->>'alarm_radius_m')::double precision then
      insert into public.item_alerts(match_id,player_id,alert_key)
        values(new.match_id,alarm.player_id,'HUNTER_ALARM') on conflict do nothing;
      update public.item_uses set private_state=jsonb_set(private_state,'{alerted}','true'::jsonb)
        where match_id=new.match_id and player_id=alarm.player_id and item_key='HUNTER_ALARM';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists xzones_evaluate_proximity_alarms on public.latest_fix;
create trigger xzones_evaluate_proximity_alarms after insert or update of lat,lon on public.latest_fix
for each row execute function public.xzones_evaluate_proximity_alarms();

create or replace function public.xzones_list_item_alerts(p_auth_user_id uuid,p_match_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare own_player uuid; alerts jsonb;
begin
  select id into own_player from public.players where match_id=p_match_id and auth_user_id=p_auth_user_id and status='ACTIVE';
  if own_player is null then return jsonb_build_object('error','NOT_MEMBER'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('alert_key',alert_key,'created_at',created_at) order by id),'[]'::jsonb)
    into alerts from public.item_alerts where match_id=p_match_id and player_id=own_player;
  return jsonb_build_object('alerts',alerts);
end $$;

revoke all on function public.xzones_activate_item(uuid,uuid,text,integer,integer,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.xzones_evaluate_proximity_alarms() from public,anon,authenticated;
revoke all on function public.xzones_list_item_alerts(uuid,uuid) from public,anon,authenticated;
grant execute on function public.xzones_activate_item(uuid,uuid,text,integer,integer,integer,integer,integer) to service_role;
grant execute on function public.xzones_list_item_alerts(uuid,uuid) to service_role;
