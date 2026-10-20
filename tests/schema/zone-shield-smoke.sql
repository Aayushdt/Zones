begin;
do $$
declare runner_auth uuid:=gen_random_uuid(); v_match uuid:=gen_random_uuid(); runner_player uuid; result jsonb;
begin
  insert into auth.users(id) values(runner_auth);
  insert into public.matches(id,code_hash,state,round_seconds,head_start_seconds,ping_seconds,zone_lat,zone_lon,zone_radius_m,started_at,head_start_ends_at,ends_at,items_enabled,expires_at)
  values(v_match,decode(repeat('c',64),'hex'),'ACTIVE',1800,0,300,0,0,200,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '20 minutes',true,clock_timestamp()+interval '1 day');
  insert into public.players(match_id,auth_user_id,display_name,role,session_cap_hash)
  values(v_match,runner_auth,'Shield Runner','RUNNER',decode(repeat('c1',32),'hex')) returning id into runner_player;
  result:=public.xzones_activate_item(runner_auth,v_match,'RUNNER_ZONE_SHIELD',30,60,100,300,5,200,50,50,60,120,30);
  if result->>'accepted'<>'true' or (result->>'active_until')::timestamptz<=clock_timestamp() then raise exception 'shield should activate: %',result; end if;
  insert into public.latest_fix(player_id,match_id,lat,lon,accuracy_m,captured_at,sequence)
  values(runner_player,v_match,1,1,1,clock_timestamp(),1);
  if (select zone_outside_samples from public.players where id=runner_player)<>0 then raise exception 'shield should suspend zone exit tracking'; end if;
  update public.item_uses set active_until=clock_timestamp()-interval '1 second' where match_id=v_match and player_id=runner_player and item_key='RUNNER_ZONE_SHIELD';
  update public.latest_fix set sequence=2,captured_at=clock_timestamp() where player_id=runner_player;
  if (select zone_outside_samples from public.players where id=runner_player)<>1 then raise exception 'expired shield must restore zone tracking'; end if;
end;
$$;
rollback;
