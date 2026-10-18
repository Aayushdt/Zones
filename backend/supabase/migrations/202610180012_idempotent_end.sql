create or replace function public.xzones_end_match(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_result public.match_results%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if not exists (select 1 from public.players where id = v_match.controller_player_id
    and match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE') then
    return jsonb_build_object('error', 'NOT_HOST');
  end if;
  if p_reason not in ('HOST_END', 'SAFETY_END') then return jsonb_build_object('error', 'INVALID_INPUT'); end if;

  if v_match.state in ('ENDED', 'CANCELLED') then
    select * into v_result from public.match_results where match_id = p_match_id;
    if not found then return jsonb_build_object('error', 'INVALID_STATE'); end if;
    return jsonb_build_object('state', v_match.state, 'winner', v_result.winner,
      'end_reason', v_result.end_reason, 'ended_at', v_result.ended_at);
  end if;
  if v_match.state not in ('HEAD_START', 'ACTIVE', 'LOBBY') then
    return jsonb_build_object('error', 'INVALID_STATE');
  end if;
  if v_match.state = 'LOBBY' then
    update public.matches set state = 'CANCELLED', revision = revision + 1 where id = p_match_id;
    insert into public.match_results(match_id, winner, end_reason, ended_at, cleanup_after)
      values (p_match_id, null, p_reason, v_now, v_now + interval '7 days')
      on conflict (match_id) do nothing;
    return jsonb_build_object('state', 'CANCELLED', 'winner', null, 'end_reason', p_reason, 'ended_at', v_now);
  end if;
  return public.xzones_finish_match(p_match_id, null, p_reason, v_now);
end;
$$;

revoke all on function public.xzones_end_match(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.xzones_end_match(uuid, uuid, text) to service_role;
