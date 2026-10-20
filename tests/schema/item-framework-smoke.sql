begin;
do $$
declare
  host_auth uuid := gen_random_uuid();
  runner_auth uuid := gen_random_uuid();
  match_id uuid := gen_random_uuid();
  host_id uuid;
  runner_id uuid;
  result jsonb;
begin
  insert into auth.users(id) values (host_auth), (runner_auth);
  insert into public.matches(id, code_hash, state, round_seconds, head_start_seconds, ping_seconds, expires_at)
    values (match_id, decode(repeat('d', 64), 'hex'), 'LOBBY', 1800, 0, 300, clock_timestamp()+interval '1 day');
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (match_id, host_auth, 'Items Host', 'HUNTER', decode(repeat('a1', 32), 'hex')) returning id into host_id;
  insert into public.players(match_id, auth_user_id, display_name, role, session_cap_hash)
    values (match_id, runner_auth, 'Items Runner', 'RUNNER', decode(repeat('a2', 32), 'hex')) returning id into runner_id;
  update public.matches set controller_player_id=host_id where id=match_id;
  result := public.xzones_set_items_enabled(host_auth, match_id, null);
  if result->>'items_enabled' <> 'false' then raise exception 'items should default off'; end if;
  result := public.xzones_activate_item(host_auth, match_id, 'HUNTER_SCAN');
  if result->>'error' <> 'ITEM_UNAVAILABLE' then raise exception 'activation should fail when items are off'; end if;
  result := public.xzones_set_items_enabled(runner_auth, match_id, true);
  if result->>'error' <> 'NOT_CONTROLLER' then raise exception 'non-controller must not toggle items'; end if;
  result := public.xzones_set_items_enabled(host_auth, match_id, true);
  if result->>'items_enabled' <> 'true' then raise exception 'controller should enable items'; end if;
  update public.matches set state='ACTIVE', started_at=clock_timestamp(), head_start_ends_at=clock_timestamp() where id=match_id;
  result := public.xzones_activate_item(runner_auth, match_id, 'HUNTER_SCAN');
  if result->>'error' <> 'ITEM_UNAVAILABLE' then raise exception 'Runner must not activate Hunter item'; end if;
  result := public.xzones_activate_item(host_auth, match_id, 'HUNTER_SCAN');
  if result->>'accepted' <> 'true' or result->>'uses_remaining' <> '0' then raise exception 'valid activation should consume one use'; end if;
  result := public.xzones_activate_item(host_auth, match_id, 'HUNTER_SCAN');
  if result->>'error' <> 'ITEM_UNAVAILABLE' then raise exception 'item should not be usable twice'; end if;
  if has_table_privilege('authenticated','public.item_uses','SELECT') or has_table_privilege('authenticated','public.item_alerts','SELECT') then
    raise exception 'clients must not directly read private item state';
  end if;
end;
$$;
rollback;
