begin;
do $$
declare
  hunter_auth uuid:=gen_random_uuid(); v_match uuid:=gen_random_uuid(); hunter_id uuid;
  result jsonb; moved_lat double precision; moved_lon double precision;
  old_lat double precision:=37.7749; old_lon double precision:=-122.4194;
  delta_m double precision;
begin
  insert into auth.users(id) values(hunter_auth);
  insert into public.matches(id,code_hash,state,round_seconds,head_start_seconds,ping_seconds,zone_lat,zone_lon,zone_radius_m,started_at,head_start_ends_at,ends_at,items_enabled,expires_at)
  values(v_match,decode(repeat('a',64),'hex'),'ACTIVE',1800,0,300,old_lat,old_lon,500,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '20 minutes',true,clock_timestamp()+interval '1 day');
  insert into public.players(match_id,auth_user_id,display_name,role,session_cap_hash)
  values(v_match,hunter_auth,'Zone Hunter','HUNTER',decode(repeat('a1',32),'hex')) returning id into hunter_id;
  result:=public.xzones_activate_item(hunter_auth,v_match,'HUNTER_ZONE_MOVER',30,60,100,300,5,200,50);
  if result->>'accepted'<>'true' then raise exception 'zone move should succeed: %',result; end if;
  moved_lat:=(result->'center'->>'lat')::double precision;
  moved_lon:=(result->'center'->>'lon')::double precision;
  delta_m:=6371000*2*asin(sqrt(power(sin(radians(moved_lat-old_lat)/2),2)
    +cos(radians(old_lat))*cos(radians(moved_lat))*power(sin(radians(moved_lon-old_lon)/2),2)));
  if delta_m<=0 or delta_m>200 then raise exception 'zone displacement out of configured range: %',delta_m; end if;
  if (select zone_radius_m from public.matches where id=v_match)<>500 then raise exception 'zone mover must preserve radius'; end if;
  result:=public.xzones_activate_item(hunter_auth,v_match,'HUNTER_ZONE_MOVER',30,60,100,300,5,200,50);
  if result->>'error'<>'ITEM_UNAVAILABLE' then raise exception 'zone mover is once per match: %',result; end if;
end;
$$;
rollback;
