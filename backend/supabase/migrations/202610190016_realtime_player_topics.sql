-- Realtime caches authorization for an established connection. Address each
-- active member independently so server fanout can stop immediately at tag/leave.
create or replace function public.xzones_can_receive_realtime_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_parts text[];
  v_role text;
  v_match_id uuid;
  v_player_id uuid;
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null or p_topic is null then return false; end if;
  v_parts := string_to_array(p_topic, ':');
  if array_length(v_parts, 1) <> 4 or v_parts[1] <> 'match'
     or v_parts[3] not in ('hunter', 'runner')
     or v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_parts[4] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_match_id := v_parts[2]::uuid;
  v_role := upper(v_parts[3]);
  v_player_id := v_parts[4]::uuid;
  return exists (
    select 1 from public.players p
    where p.id = v_player_id
      and p.match_id = v_match_id
      and p.auth_user_id = v_auth_user_id
      and p.status = 'ACTIVE'
      and p.role::text = v_role
  );
end;
$$;

revoke all on function public.xzones_can_receive_realtime_topic(text) from public, anon;
grant execute on function public.xzones_can_receive_realtime_topic(text) to authenticated, service_role;
