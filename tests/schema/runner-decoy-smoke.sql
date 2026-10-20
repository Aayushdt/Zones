begin;
do $$
declare
  runner_auth uuid:=gen_random_uuid(); hunter_auth uuid:=gen_random_uuid(); v_match uuid:=gen_random_uuid(); runner_player_id uuid;
  result jsonb; real_lat double precision:=51.5; real_lon double precision:=-0.12; delta_m double precision;
begin
  insert into auth.users(id) values(runner_auth),(hunter_auth);
  insert into public.matches(id,code_hash,state,round_seconds,head_start_seconds,ping_seconds,started_at,head_start_ends_at,ends_at,items_enabled,expires_at)
  values(v_match,decode(repeat('b',64),'hex'),'ACTIVE',1800,0,300,clock_timestamp()-interval '10 seconds',clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '20 minutes',true,clock_timestamp()+interval '1 day');
  insert into public.players(match_id,auth_user_id,display_name,role,session_cap_hash)
  values(v_match,runner_auth,'Decoy Runner','RUNNER',decode(repeat('b1',32),'hex')) returning id into runner_player_id;
  insert into public.players(match_id,auth_user_id,display_name,role,session_cap_hash)
  values(v_match,hunter_auth,'Decoy Hunter','HUNTER',decode(repeat('b2',32),'hex'));
  insert into public.latest_fix(player_id,match_id,lat,lon,accuracy_m,captured_at,sequence)
  values(runner_player_id,v_match,real_lat,real_lon,5,clock_timestamp(),1);
  result:=public.xzones_activate_item(runner_auth,v_match,'RUNNER_DECOY',30,60,100,300,5,200,50,50,60);
  if result->>'accepted'<>'true' then raise exception 'Runner decoy should arm: %',result; end if;
  select 6371000*2*asin(sqrt(power(sin(radians(lat-real_lat)/2),2)+cos(radians(real_lat))*cos(radians(lat))*power(sin(radians(lon-real_lon)/2),2))) into delta_m
    from public.ping_snapshots s where s.match_id=v_match and s.runner_id=runner_player_id and s.ping_index=(result->>'ping_index')::integer;
  if delta_m is null or delta_m>50 then raise exception 'decoy must be within configured offset: %',delta_m; end if;
  if jsonb_array_length(public.xzones_sync_match(runner_auth,v_match,0)->'due_pings')<>0 then raise exception 'Runner must never receive Hunter ping coordinates'; end if;
  result:=public.xzones_activate_item(runner_auth,v_match,'RUNNER_DECOY',30,60,100,300,5,200,50,50,60);
  if result->>'error'<>'ITEM_UNAVAILABLE' then raise exception 'decoy should be one use: %',result; end if;
end;
$$;
rollback;
