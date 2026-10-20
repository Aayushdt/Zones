begin;
do $$
declare runner_auth uuid:=gen_random_uuid(); hunter_auth uuid:=gen_random_uuid(); v_match uuid:=gen_random_uuid(); runner_player uuid; result jsonb;
begin
  insert into auth.users(id) values(runner_auth),(hunter_auth);
  insert into public.matches(id,code_hash,state,round_seconds,head_start_seconds,ping_seconds,started_at,head_start_ends_at,ends_at,items_enabled,expires_at)
  values(v_match,decode(repeat('d',64),'hex'),'ACTIVE',1800,0,300,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '20 minutes',true,clock_timestamp()+interval '1 day');
  insert into public.players(match_id,auth_user_id,display_name,role,session_cap_hash) values(v_match,runner_auth,'Camo Runner','RUNNER',decode(repeat('d1',32),'hex')) returning id into runner_player;
  insert into public.players(match_id,auth_user_id,display_name,role,session_cap_hash) values(v_match,hunter_auth,'Camo Hunter','HUNTER',decode(repeat('d2',32),'hex'));
  insert into public.latest_fix(player_id,match_id,lat,lon,accuracy_m,captured_at,sequence) values(runner_player,v_match,20,20,5,clock_timestamp(),1);
  result:=public.xzones_activate_item(runner_auth,v_match,'RUNNER_CAMOUFLAGE',30,60,100,300,5,200,50,50,60,120,30,true);
  if result->>'accepted'<>'true' then raise exception 'camouflage should activate: %',result; end if;
  insert into public.ping_snapshots(match_id,runner_id,ping_index,status,ping_at,age_seconds,received_at,revision)
  values(v_match,runner_player,0,'NO_FIX',clock_timestamp(),0,clock_timestamp(),1);
  if exists(select 1 from public.ping_snapshots where match_id=v_match and runner_id=runner_player) then raise exception 'camouflage must exclude next ping'; end if;
  result:=public.xzones_activate_item(hunter_auth,v_match,'HUNTER_SCAN',30,60,100,300,5,200,50,50,60,120,30,true);
  if result->>'accepted'<>'true' or jsonb_array_length(result->'runner_positions')<>0 then raise exception 'camouflage must exclude Runner from Scan: %',result; end if;
end;
$$;
rollback;
