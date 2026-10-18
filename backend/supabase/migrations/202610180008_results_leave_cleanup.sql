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
  insert into public.match_results(match_id, winner, end_reason, ended_at, cleanup_after)
    values (p_match_id, p_winner, p_reason, p_now, p_now + interval '7 days')
    on conflict (match_id) do nothing;
  return jsonb_build_object('state', 'ENDED', 'winner', p_winner, 'end_reason', p_reason, 'ended_at', p_now);
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
  v_now timestamptz := clock_timestamp();
  v_winner public.player_role;
  v_reason text;
  v_ended_at timestamptz;
  v_result public.match_results%rowtype;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  select id into v_player_id from public.players where match_id = p_match_id and auth_user_id = p_auth_user_id;
  if not found then
    return jsonb_build_object('error', 'NOT_MEMBER');
  end if;
  update public.players set last_seen_at = v_now where id = v_player_id and status = 'ACTIVE';

  if v_match.state = 'HEAD_START' and v_now >= v_match.head_start_ends_at then
    update public.matches set state = 'ACTIVE', revision = revision + 1 where id = p_match_id;
    select * into v_match from public.matches where id = p_match_id;
  end if;

  if v_match.state in ('HEAD_START', 'ACTIVE') then
    if v_match.controller_player_id is not null then
      select coalesce(last_seen_at, v_match.started_at) into v_controller_last_seen
        from public.players where id = v_match.controller_player_id;
      if v_controller_last_seen is not null and v_controller_last_seen <= v_now - interval '60 seconds' then
        update public.matches set controller_player_id = null, claim_expires_at = v_now + interval '5 minutes',
          revision = revision + 1 where id = p_match_id;
        select * into v_match from public.matches where id = p_match_id;
      end if;
    end if;
    select count(*) filter (where role = 'HUNTER'), count(*) filter (where role = 'RUNNER')
      into v_hunters, v_runners from public.players where match_id = p_match_id and status = 'ACTIVE';
    if v_hunters = 0 then
      v_winner := 'RUNNER'; v_reason := 'ALL_HUNTERS_LEFT';
    elsif v_runners = 0 then
      v_winner := 'HUNTER'; v_reason := 'ALL_RUNNERS_TAGGED_OR_LEFT';
    elsif v_match.ends_at is not null and v_now >= v_match.ends_at then
      v_winner := 'RUNNER'; v_reason := 'TIME_EXPIRED';
    elsif v_match.controller_player_id is null and v_match.claim_expires_at is not null
      and v_now >= v_match.claim_expires_at then
      v_winner := null; v_reason := 'HOST_LOST';
    end if;
    if v_reason is not null then
      v_ended_at := case when v_reason = 'TIME_EXPIRED' then v_match.ends_at
        when v_reason = 'HOST_LOST' then v_match.claim_expires_at else v_now end;
      perform public.xzones_finish_match(p_match_id, v_winner, v_reason, v_ended_at);
    end if;
  elsif v_match.state = 'LOBBY' and v_match.expires_at <= v_now then
    update public.matches set state = 'CANCELLED', revision = revision + 1 where id = p_match_id;
    insert into public.match_results(match_id, winner, end_reason, ended_at, cleanup_after)
      values (p_match_id, null, 'LOBBY_EXPIRED', v_now, v_now + interval '7 days')
      on conflict (match_id) do nothing;
  end if;

  select * into v_result from public.match_results where match_id = p_match_id;
  return jsonb_build_object('state', (select state from public.matches where id = p_match_id),
    'winner', v_result.winner, 'end_reason', v_result.end_reason, 'ended_at', v_result.ended_at);
end;
$$;

create or replace function public.xzones_leave_match(p_auth_user_id uuid, p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player public.players%rowtype;
  v_now timestamptz := clock_timestamp();
  v_hunters integer;
  v_runners integer;
  v_winner public.player_role;
  v_reason text;
  v_ended_at timestamptz;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  select * into v_player from public.players where match_id = p_match_id and auth_user_id = p_auth_user_id for update;
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;
  if v_player.status = 'LEFT' then return jsonb_build_object('accepted', true, 'state', v_match.state); end if;

  update public.players set status = 'LEFT', ready = false, last_seen_at = v_now where id = v_player.id;
  delete from public.latest_fix where match_id = p_match_id and player_id = v_player.id;
  update public.qr_challenges set used_at = v_now where match_id = p_match_id and runner_id = v_player.id and used_at is null;

  if v_match.state = 'LOBBY' and v_player.id = v_match.host_player_id then
    update public.matches set state = 'CANCELLED', controller_player_id = null, claim_expires_at = null,
      revision = revision + 1 where id = p_match_id;
    insert into public.match_results(match_id, winner, end_reason, ended_at, cleanup_after)
      values (p_match_id, null, 'HOST_LEFT_LOBBY', v_now, v_now + interval '7 days')
      on conflict (match_id) do nothing;
  elsif v_match.state in ('HEAD_START', 'ACTIVE') and v_player.id = v_match.controller_player_id then
    update public.matches set controller_player_id = null, claim_expires_at = v_now + interval '5 minutes',
      revision = revision + 1 where id = p_match_id;
  else
    update public.matches set revision = revision + 1 where id = p_match_id;
  end if;

  if v_match.state = 'HEAD_START' then
    update public.matches set state = 'ACTIVE', revision = revision + 1
      where id = p_match_id and head_start_ends_at <= v_now;
  end if;
  if v_match.state in ('HEAD_START', 'ACTIVE') then
    select count(*) filter (where role = 'HUNTER'), count(*) filter (where role = 'RUNNER')
      into v_hunters, v_runners from public.players where match_id = p_match_id and status = 'ACTIVE';
    if v_hunters = 0 then v_winner := 'RUNNER'; v_reason := 'ALL_HUNTERS_LEFT';
    elsif v_runners = 0 then v_winner := 'HUNTER'; v_reason := 'ALL_RUNNERS_TAGGED_OR_LEFT';
    elsif v_match.ends_at is not null and v_now >= v_match.ends_at then v_winner := 'RUNNER'; v_reason := 'TIME_EXPIRED';
    end if;
    if v_reason is not null then
      v_ended_at := case when v_reason = 'TIME_EXPIRED' then v_match.ends_at else v_now end;
      perform public.xzones_finish_match(p_match_id, v_winner, v_reason, v_ended_at);
    end if;
  end if;
  return jsonb_build_object('accepted', true, 'state', (select state from public.matches where id = p_match_id),
    'claim_expires_at', (select claim_expires_at from public.matches where id = p_match_id));
end;
$$;

create or replace function public.xzones_claim_controller(p_auth_user_id uuid, p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  select id into v_player_id from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE';
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;
  if v_match.state not in ('HEAD_START', 'ACTIVE') then return jsonb_build_object('error', 'INVALID_STATE'); end if;
  if v_match.controller_player_id is not null and exists (
    select 1 from public.players where id = v_match.controller_player_id and status = 'ACTIVE'
  ) then return jsonb_build_object('error', 'CLAIM_UNAVAILABLE'); end if;
  if v_match.claim_expires_at is null or v_now >= v_match.claim_expires_at then
    return jsonb_build_object('error', 'CLAIM_EXPIRED');
  end if;
  update public.matches set controller_player_id = v_player_id, host_player_id = v_player_id,
    claim_expires_at = null, revision = revision + 1 where id = p_match_id;
  return jsonb_build_object('accepted', true, 'controller_player_id', v_player_id);
end;
$$;

create or replace function public.xzones_end_match(p_auth_user_id uuid, p_match_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if not exists (select 1 from public.players where id = v_match.controller_player_id
    and match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE') then
    return jsonb_build_object('error', 'NOT_HOST');
  end if;
  if v_match.state not in ('HEAD_START', 'ACTIVE', 'LOBBY') then return jsonb_build_object('error', 'INVALID_STATE'); end if;
  if p_reason not in ('HOST_END', 'SAFETY_END') then return jsonb_build_object('error', 'INVALID_INPUT'); end if;
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

create or replace function public.xzones_match_result(p_auth_user_id uuid, p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result public.match_results%rowtype;
  v_started_at timestamptz;
  v_tag_count integer;
begin
  if not exists (select 1 from public.players where match_id = p_match_id and auth_user_id = p_auth_user_id) then
    return jsonb_build_object('error', 'NOT_MEMBER');
  end if;
  select * into v_result from public.match_results where match_id = p_match_id;
  if not found then return jsonb_build_object('error', 'NOT_ENDED'); end if;
  select started_at into v_started_at from public.matches where id = p_match_id;
  select count(*) into v_tag_count from public.tags where match_id = p_match_id;
  return jsonb_build_object('winner', v_result.winner, 'end_reason', v_result.end_reason,
    'ended_at', v_result.ended_at, 'duration_seconds', greatest(0, floor(extract(epoch from (v_result.ended_at - coalesce(v_started_at, v_result.ended_at))))::integer),
    'tag_count', v_tag_count);
end;
$$;

create or replace function public.xzones_match_controls(p_auth_user_id uuid, p_match_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select case when exists (select 1 from public.players where match_id = p_match_id
      and auth_user_id = p_auth_user_id and status = 'ACTIVE')
    then jsonb_build_object('can_end', exists (select 1 from public.matches m join public.players p
      on p.id = m.controller_player_id where m.id = p_match_id and p.auth_user_id = p_auth_user_id and p.status = 'ACTIVE'),
      'can_claim', exists (select 1 from public.matches m join public.players p on p.match_id = m.id
        where m.id = p_match_id and m.controller_player_id is null and m.claim_expires_at > clock_timestamp()
          and p.auth_user_id = p_auth_user_id and p.status = 'ACTIVE'),
      'claim_expires_at', (select m.claim_expires_at from public.matches m where m.id = p_match_id))
    else jsonb_build_object('error', 'NOT_MEMBER') end;
$$;

create or replace function public.xzones_cleanup(p_now timestamptz default clock_timestamp())
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_challenges integer;
  v_limits integer;
  v_snapshots integer;
  v_matches integer;
begin
  delete from public.qr_challenges where expires_at <= p_now or created_at <= p_now - interval '7 days';
  get diagnostics v_challenges = row_count;
  delete from public.rate_limits where expires_at <= p_now;
  get diagnostics v_limits = row_count;
  delete from public.ping_snapshots where ping_at <= p_now - interval '7 days';
  get diagnostics v_snapshots = row_count;
  delete from public.matches m
    where (m.state in ('ENDED', 'CANCELLED') and exists (
      select 1 from public.match_results r where r.match_id = m.id and r.cleanup_after <= p_now
    )) or (m.state = 'LOBBY' and m.expires_at <= p_now);
  get diagnostics v_matches = row_count;
  return jsonb_build_object('deleted_challenges', v_challenges, 'deleted_rate_limits', v_limits,
    'deleted_snapshots', v_snapshots, 'deleted_matches', v_matches);
end;
$$;

revoke all on function public.xzones_finish_match(uuid, public.player_role, text, timestamptz) from public, anon, authenticated;
revoke all on function public.xzones_resolve_match(uuid, uuid) from public, anon, authenticated;
revoke all on function public.xzones_leave_match(uuid, uuid) from public, anon, authenticated;
revoke all on function public.xzones_claim_controller(uuid, uuid) from public, anon, authenticated;
revoke all on function public.xzones_end_match(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.xzones_match_result(uuid, uuid) from public, anon, authenticated;
revoke all on function public.xzones_match_controls(uuid, uuid) from public, anon, authenticated;
revoke all on function public.xzones_cleanup(timestamptz) from public, anon, authenticated;
grant execute on function public.xzones_resolve_match(uuid, uuid) to service_role;
grant execute on function public.xzones_leave_match(uuid, uuid) to service_role;
grant execute on function public.xzones_claim_controller(uuid, uuid) to service_role;
grant execute on function public.xzones_end_match(uuid, uuid, text) to service_role;
grant execute on function public.xzones_match_result(uuid, uuid) to service_role;
grant execute on function public.xzones_match_controls(uuid, uuid) to service_role;
grant execute on function public.xzones_cleanup(timestamptz) to service_role;
