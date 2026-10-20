begin;
do $$
declare
  hunter_auth uuid:=gen_random_uuid(); runner_auth uuid:=gen_random_uuid(); other_hunter_auth uuid:=gen_random_uuid();
  v_match uuid:=gen_random_uuid(); hunter_id uuid; runner_id uuid;
  result jsonb;
begin
  insert into auth.users(id) values(hunter_auth),(runner_auth),(other_hunter_auth);
  insert into public.matches(id,code_hash,state,round_seconds,head_start_seconds,ping_seconds,started_at,head_start_ends_at,ends_at,items_enabled,expires_at)
  values(v_match,decode(repeat('f',64),'hex'),'ACTIVE',1800,0,300,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '20 minutes',true,clock_timestamp()+interval '1 day');
  insert into public.players(match_id,auth_user_id,display_name,role,session_cap_hash)
  values(v_match,hunter_auth,'Alarm Hunter','HUNTER',decode(repeat('f1',32),'hex')) returning id into hunter_id;
  insert into public.players(match_id,auth_user_id,display_name,role,session_cap_hash)
  values(v_match,runner_auth,'Alarm Runner','RUNNER',decode(repeat('f2',32),'hex')) returning id into runner_id;
  insert into public.players(match_id,auth_user_id,display_name,role,session_cap_hash)
  values(v_match,other_hunter_auth,'Other Hunter','HUNTER',decode(repeat('f3',32),'hex'));
  insert into public.latest_fix(player_id,match_id,lat,lon,accuracy_m,captured_at,sequence)
  values(hunter_id,v_match,40,-74,5,clock_timestamp(),1);
  result:=public.xzones_activate_item(hunter_auth,v_match,'HUNTER_ALARM',30,60,100,300,5);
  if result->>'accepted'<>'true' then raise exception 'fresh Hunter should place alarm: %',result; end if;
  insert into public.latest_fix(player_id,match_id,lat,lon,accuracy_m,captured_at,sequence)
  values(runner_id,v_match,40.01,-74,5,clock_timestamp(),1);
  if exists(select 1 from public.item_alerts where match_id=v_match) then raise exception 'distant Runner must not trigger alarm'; end if;
  update public.latest_fix set lat=40.00005,sequence=2,captured_at=clock_timestamp() where player_id=runner_id;
  if (select count(*) from public.item_alerts where match_id=v_match and player_id=hunter_id)<>1 then raise exception 'in-range Runner should alert only alarm placer'; end if;
  update public.latest_fix set lat=40.00004,sequence=3,captured_at=clock_timestamp() where player_id=runner_id;
  if (select count(*) from public.item_alerts where match_id=v_match)<>1 then raise exception 'alarm should alert only once'; end if;
  if jsonb_array_length(public.xzones_list_item_alerts(other_hunter_auth,v_match)->'alerts')<>0 then raise exception 'other Hunter must not see alarm alert'; end if;
  if jsonb_array_length(public.xzones_list_item_alerts(hunter_auth,v_match)->'alerts')<>1 then raise exception 'placer should see one alert'; end if;
end;
$$;
rollback;
