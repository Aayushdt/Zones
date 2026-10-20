alter table public.players add column if not exists host_hidden_since timestamptz;

create or replace function public.xzones_report_controller_visibility(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_hidden boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_player public.players%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select p.* into v_player
    from public.players p join public.matches m on m.id = p.match_id
    where p.match_id = p_match_id and p.auth_user_id = p_auth_user_id
      and p.id = m.controller_player_id and p.status = 'ACTIVE'
    for update of p;
  if not found then return jsonb_build_object('error', 'NOT_HOST'); end if;
  if p_hidden then
    update public.players set host_hidden_since = coalesce(host_hidden_since, v_now) where id = v_player.id;
  else
    update public.players set last_seen_at = v_now, host_hidden_since = null where id = v_player.id;
  end if;
  return jsonb_build_object('accepted', true, 'hidden', p_hidden);
end;
$$;

create or replace function public.xzones_resolve_match(p_auth_user_id uuid, p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_hunters integer;
  v_runners integer;
  v_player_id uuid;
  v_controller_last_seen timestamptz;
  v_controller_hidden_since timestamptz;
  v_now timestamptz := clock_timestamp();
  v_winner public.player_role;
  v_reason text;
  v_ended_at timestamptz;
  v_result public.match_results%rowtype;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  select id into v_player_id from public.players where match_id = p_match_id and auth_user_id = p_auth_user_id;
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;
  update public.players set last_seen_at = v_now where id = v_player_id and status = 'ACTIVE'
    and host_hidden_since is null;

  if v_match.state = 'HEAD_START' and v_now >= v_match.head_start_ends_at then
    update public.matches set state = 'ACTIVE', revision = revision + 1 where id = p_match_id;
    select * into v_match from public.matches where id = p_match_id;
  end if;

  if v_match.state in ('HEAD_START', 'ACTIVE') and v_match.controller_player_id is not null then
    select coalesce(last_seen_at, v_match.started_at), host_hidden_since
      into v_controller_last_seen, v_controller_hidden_since
      from public.players where id = v_match.controller_player_id;
    if v_controller_hidden_since is null and v_controller_last_seen is not null
      and v_controller_last_seen <= v_now - interval '180 seconds' then
      update public.matches set controller_player_id = null, claim_expires_at = v_now + interval '5 minutes',
        revision = revision + 1 where id = p_match_id;
      select * into v_match from public.matches where id = p_match_id;
    end if;
  end if;

  if v_match.state in ('HEAD_START', 'ACTIVE') then
    select count(*) filter (where role = 'HUNTER'), count(*) filter (where role = 'RUNNER')
      into v_hunters, v_runners from public.players where match_id = p_match_id and status = 'ACTIVE';
    if v_runners = 0 then v_winner := 'HUNTER'; v_reason := 'ALL_RUNNERS_TAGGED_OR_LEFT';
    elsif v_hunters = 0 then v_winner := 'RUNNER'; v_reason := 'ALL_HUNTERS_LEFT';
    elsif v_match.ends_at is not null and v_now >= v_match.ends_at then v_winner := 'RUNNER'; v_reason := 'TIME_LIMIT';
    elsif v_match.controller_player_id is null and v_match.claim_expires_at is not null
      and v_now >= v_match.claim_expires_at then v_winner := null; v_reason := 'HOST_LOST';
    end if;
    if v_reason is not null then
      v_ended_at := case when v_reason = 'TIME_LIMIT' then v_match.ends_at
        when v_reason = 'HOST_LOST' then v_match.claim_expires_at else v_now end;
      perform public.xzones_finish_match(p_match_id, v_winner, v_reason, v_ended_at);
    end if;
  elsif v_match.state = 'LOBBY' and v_match.expires_at <= v_now then
    update public.matches set state = 'CANCELLED', revision = revision + 1 where id = p_match_id;
    insert into public.match_results(match_id, winner, end_reason, ended_at, cleanup_after)
      values (p_match_id, null, 'LOBBY_EXPIRED', v_now, v_now + interval '7 days') on conflict (match_id) do nothing;
  end if;
  select * into v_result from public.match_results where match_id = p_match_id;
  return jsonb_build_object('state', (select state from public.matches where id = p_match_id),
    'winner', v_result.winner, 'end_reason', v_result.end_reason, 'ended_at', v_result.ended_at);
end;
$$;

revoke all on function public.xzones_report_controller_visibility(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.xzones_report_controller_visibility(uuid, uuid, boolean) to service_role;
revoke all on function public.xzones_resolve_match(uuid, uuid) from public, anon, authenticated;
grant execute on function public.xzones_resolve_match(uuid, uuid) to service_role;
