begin;
do $$
declare
  hunter_auth uuid := gen_random_uuid(); runner_auth uuid := gen_random_uuid();
  v_match_id uuid := gen_random_uuid(); hunter_id uuid; runner_id uuid;
  result jsonb;
begin
  insert into auth.users(id) values (hunter_auth),(runner_auth);
  insert into public.matches(id,code_hash,state,round_seconds,head_start_seconds,ping_seconds,started_at,head_start_ends_at,ends_at,items_enabled,expires_at)
  values(v_match_id,decode(repeat('e',64),'hex'),'ACTIVE',1800,0,300,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '20 minutes',true,clock_timestamp()+interval '1 day');
  insert into public.players(match_id,auth_user_id,display_name,role,session_cap_hash)
  values(v_match_id,hunter_auth,'Scan Hunter','HUNTER',decode(repeat('e1',32),'hex')) returning id into hunter_id;
  insert into public.players(match_id,auth_user_id,display_name,role,session_cap_hash)
  values(v_match_id,runner_auth,'Scan Runner','RUNNER',decode(repeat('e2',32),'hex')) returning id into runner_id;
  insert into public.latest_fix(player_id,match_id,lat,lon,accuracy_m,captured_at,sequence)
  values(runner_id,v_match_id,40.7128,-74.0060,8,clock_timestamp(),1);
  result := public.xzones_activate_item(hunter_auth,v_match_id,'HUNTER_SCAN',30,60);
  if result->>'accepted' <> 'true' or jsonb_array_length(result->'runner_positions') <> 1
    or result->'runner_positions'->0->>'runner_id' <> runner_id::text then
    raise exception 'Hunter scan should reveal fresh Runner fixes only to the invoking Hunter: %',result;
  end if;
  if (result->>'scan_until')::timestamptz <= clock_timestamp() then raise exception 'scan expiry must be in the future'; end if;
  result := public.xzones_activate_item(runner_auth,v_match_id,'HUNTER_SCAN',30,60);
  if result->>'error' <> 'ITEM_UNAVAILABLE' then raise exception 'Runner must not receive Hunter scan data: %',result; end if;
  if (select count(*) from public.item_uses u where u.match_id=v_match_id and u.player_id=hunter_id) <> 1 then
    raise exception 'scan use should be recorded only for the Hunter';
  end if;
end;
$$;
rollback;
