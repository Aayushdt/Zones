create or replace function public.xzones_lobby_status(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_players integer;
  v_hunters integer;
  v_runners integer;
  v_unassigned integer;
  v_everyone_ready boolean;
  v_block_reason text;
begin
  select count(*), count(*) filter (where role = 'HUNTER'),
         count(*) filter (where role = 'RUNNER'), count(*) filter (where role is null),
         coalesce(bool_and(ready), false)
    into v_players, v_hunters, v_runners, v_unassigned, v_everyone_ready
    from public.players where match_id = p_match_id and status = 'ACTIVE';

  v_block_reason := case
    when v_players < 2 then 'NEEDS_TWO_PLAYERS'
    when v_players > 100 then 'LOBBY_FULL'
    when v_unassigned > 0 or v_hunters < 1 or v_hunters > floor(v_players::numeric / 2)::integer or v_runners = 0 then 'NEEDS_TEAMS'
    when not v_everyone_ready then 'WAITING_FOR_READY'
    else null
  end;

  return jsonb_build_object(
    'active_counts', jsonb_build_object('hunters', v_hunters, 'runners', v_runners),
    'player_count', v_players,
    'can_start', v_block_reason is null,
    'block_reason', v_block_reason
  );
end;
$$;

revoke all on function public.xzones_lobby_status(uuid) from public, anon, authenticated;
grant execute on function public.xzones_lobby_status(uuid) to service_role;

create or replace function public.xzones_set_hunter_count(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_hunter_count integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player_count integer;
  v_controller boolean;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state <> 'LOBBY' then return jsonb_build_object('error', 'INVALID_STATE'); end if;
  select exists(select 1 from public.players where match_id = p_match_id and auth_user_id = p_auth_user_id
    and id = v_match.controller_player_id and status = 'ACTIVE') into v_controller;
  if not v_controller then return jsonb_build_object('error', 'NOT_HOST'); end if;
  select count(*) into v_player_count from public.players where match_id = p_match_id and status = 'ACTIVE';
  if p_hunter_count is null or p_hunter_count < 1 or p_hunter_count > floor(v_player_count::numeric / 2)::integer then
    return jsonb_build_object('error', 'INVALID_HUNTER_COUNT');
  end if;

  with ordered_players as (
    select id, row_number() over (order by joined_at, id) as position
      from public.players where match_id = p_match_id and status = 'ACTIVE'
  )
  update public.players player set
    role = case when ordered_players.position <= p_hunter_count then 'HUNTER'::public.player_role else 'RUNNER'::public.player_role end,
    ready = false
  from ordered_players where player.id = ordered_players.id;

  update public.matches set revision = revision + 1 where id = p_match_id;
  return jsonb_build_object('counts', jsonb_build_object('hunters', p_hunter_count, 'runners', v_player_count - p_hunter_count));
end;
$$;

revoke all on function public.xzones_set_hunter_count(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.xzones_set_hunter_count(uuid, uuid, integer) to service_role;
