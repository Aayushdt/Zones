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
  v_target_hunters integer;
  v_block_reason text;
begin
  select count(*),
         count(*) filter (where role = 'HUNTER'),
         count(*) filter (where role = 'RUNNER'),
         count(*) filter (where role is null),
         coalesce(bool_and(ready), false)
    into v_players, v_hunters, v_runners, v_unassigned, v_everyone_ready
    from public.players where match_id = p_match_id and status = 'ACTIVE';

  v_target_hunters := least(greatest(ceil(v_players::numeric / 10)::integer, 1), floor(v_players::numeric / 2)::integer);
  v_block_reason := case
    when v_players < 3 then 'NEEDS_THREE_PLAYERS'
    when v_players > 12 then 'LOBBY_FULL'
    when v_unassigned > 0 or v_runners = 0 or v_hunters <> v_target_hunters then 'NEEDS_TEAMS'
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
