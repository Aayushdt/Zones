create or replace function public.xzones_finish_match(
  p_match_id uuid,
  p_winner public.player_role,
  p_reason text,
  p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state = 'ENDED' then
    return jsonb_build_object('state', 'ENDED', 'winner', (select winner from public.match_results where match_id = p_match_id),
      'end_reason', (select end_reason from public.match_results where match_id = p_match_id));
  end if;
  if v_match.state not in ('HEAD_START', 'ACTIVE', 'LOBBY') then
    return jsonb_build_object('error', 'INVALID_STATE');
  end if;
  update public.matches set state = 'ENDED', revision = revision + 1 where id = p_match_id;
  delete from public.latest_fix where match_id = p_match_id;
  delete from public.ping_snapshots where match_id = p_match_id;
  update public.players set stationary_anchor_lat = null, stationary_anchor_lon = null,
    stationary_since = null, stationary_warning_at = null, stationary_revealed_at = null where match_id = p_match_id;
  insert into public.match_results(match_id, winner, end_reason, ended_at, cleanup_after)
    values (p_match_id, p_winner, p_reason, p_now, p_now + interval '7 days')
    on conflict (match_id) do nothing;
  return jsonb_build_object('state', 'ENDED', 'winner', p_winner, 'end_reason', p_reason, 'ended_at', p_now);
end;
$$;

revoke all on function public.xzones_finish_match(uuid, public.player_role, text, timestamptz) from public, anon, authenticated;
grant execute on function public.xzones_finish_match(uuid, public.player_role, text, timestamptz) to service_role;
