create or replace function public.xzones_issue_qr(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_token_hash bytea
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_runner_id uuid;
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz;
begin
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    return jsonb_build_object('error', 'INVALID_INPUT');
  end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state <> 'ACTIVE' or v_match.ends_at is null or v_now >= v_match.ends_at then
    return jsonb_build_object('error', 'INACTIVE');
  end if;
  select id into v_runner_id from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and role = 'RUNNER' and status = 'ACTIVE';
  if not found then return jsonb_build_object('error', 'WRONG_ROLE'); end if;

  delete from public.qr_challenges where match_id = p_match_id and runner_id = v_runner_id and used_at is null;
  v_expires_at := v_now + interval '60 seconds';
  insert into public.qr_challenges(match_id, runner_id, token_hash, expires_at)
  values (p_match_id, v_runner_id, p_token_hash, v_expires_at);
  return jsonb_build_object('expires_at', v_expires_at, 'server_now', v_now);
end;
$$;

create or replace function public.xzones_scan_qr(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_token_hash bytea
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_hunter_id uuid;
  v_challenge public.qr_challenges%rowtype;
  v_runner public.players%rowtype;
  v_now timestamptz := clock_timestamp();
  v_hunters integer;
  v_runners integer;
  v_winner public.player_role;
  v_reason text;
  v_tag_id uuid;
begin
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    return jsonb_build_object('error', 'INVALID_QR');
  end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state = 'HEAD_START' and v_match.head_start_ends_at <= v_now then
    update public.matches set state = 'ACTIVE', revision = revision + 1 where id = p_match_id;
    select * into v_match from public.matches where id = p_match_id;
  end if;
  if v_match.state <> 'ACTIVE' then return jsonb_build_object('error', 'INACTIVE'); end if;

  select id into v_hunter_id from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and role = 'HUNTER' and status = 'ACTIVE';
  if not found then return jsonb_build_object('error', 'WRONG_ROLE'); end if;

  select * into v_challenge from public.qr_challenges where token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('error', 'INVALID_QR'); end if;
  if v_challenge.match_id <> p_match_id then return jsonb_build_object('error', 'WRONG_MATCH'); end if;
  if v_challenge.used_at is not null then return jsonb_build_object('error', 'QR_USED'); end if;
  if v_challenge.expires_at <= v_now then return jsonb_build_object('error', 'QR_EXPIRED'); end if;

  select * into v_runner from public.players
    where match_id = p_match_id and id = v_challenge.runner_id and role = 'RUNNER' and status = 'ACTIVE' for update;
  if not found then return jsonb_build_object('error', 'ALREADY_TAGGED'); end if;
  if v_match.ends_at is not null and v_now >= v_match.ends_at then return jsonb_build_object('error', 'DEADLINE_PASSED'); end if;

  update public.qr_challenges set used_at = v_now where id = v_challenge.id;
  insert into public.tags(match_id, hunter_id, runner_id, method, accepted_at)
  values (p_match_id, v_hunter_id, v_runner.id, 'QR', v_now) returning id into v_tag_id;
  update public.players set status = 'TAGGED', ready = false where id = v_runner.id;
  delete from public.latest_fix where match_id = p_match_id and player_id = v_runner.id;
  update public.matches set revision = revision + 1 where id = p_match_id;

  select count(*) filter (where role = 'HUNTER'), count(*) filter (where role = 'RUNNER')
    into v_hunters, v_runners from public.players where match_id = p_match_id and status = 'ACTIVE';
  if v_runners = 0 then
    v_winner := 'HUNTER';
    v_reason := 'ALL_RUNNERS_TAGGED_OR_LEFT';
    update public.matches set state = 'ENDED', revision = revision + 1 where id = p_match_id;
    delete from public.latest_fix where match_id = p_match_id;
    insert into public.match_results(match_id, winner, end_reason, ended_at, cleanup_after)
      values (p_match_id, v_winner, v_reason, v_now, v_now + interval '7 days')
      on conflict (match_id) do nothing;
  end if;

  return jsonb_build_object('accepted', true, 'tag_id', v_tag_id, 'accepted_at', v_now,
    'state', case when v_winner is null then 'ACTIVE' else 'ENDED' end,
    'winner', v_winner, 'active_counts', jsonb_build_object('hunters', v_hunters, 'runners', v_runners));
end;
$$;

create or replace function public.xzones_confirm_tag(
  p_auth_user_id uuid,
  p_match_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_runner public.players%rowtype;
  v_now timestamptz := clock_timestamp();
  v_hunters integer;
  v_runners integer;
  v_winner public.player_role;
  v_reason text;
  v_tag_id uuid;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state = 'HEAD_START' and v_match.head_start_ends_at <= v_now then
    update public.matches set state = 'ACTIVE', revision = revision + 1 where id = p_match_id;
    select * into v_match from public.matches where id = p_match_id;
  end if;
  if v_match.state <> 'ACTIVE' then return jsonb_build_object('error', 'INACTIVE'); end if;

  select * into v_runner from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and role = 'RUNNER' and status = 'ACTIVE' for update;
  if not found then
    if exists (select 1 from public.players where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'TAGGED') then
      return jsonb_build_object('error', 'ALREADY_TAGGED');
    end if;
    return jsonb_build_object('error', 'WRONG_ROLE');
  end if;
  if v_match.ends_at is not null and v_now >= v_match.ends_at then return jsonb_build_object('error', 'DEADLINE_PASSED'); end if;

  insert into public.tags(match_id, hunter_id, runner_id, method, accepted_at)
    values (p_match_id, null, v_runner.id, 'RUNNER_CONFIRM', v_now) returning id into v_tag_id;
  update public.qr_challenges set used_at = v_now
    where match_id = p_match_id and runner_id = v_runner.id and used_at is null;
  update public.players set status = 'TAGGED', ready = false where id = v_runner.id;
  delete from public.latest_fix where match_id = p_match_id and player_id = v_runner.id;
  update public.matches set revision = revision + 1 where id = p_match_id;

  select count(*) filter (where role = 'HUNTER'), count(*) filter (where role = 'RUNNER')
    into v_hunters, v_runners from public.players where match_id = p_match_id and status = 'ACTIVE';
  if v_runners = 0 then
    v_winner := 'HUNTER';
    v_reason := 'ALL_RUNNERS_TAGGED_OR_LEFT';
    update public.matches set state = 'ENDED', revision = revision + 1 where id = p_match_id;
    delete from public.latest_fix where match_id = p_match_id;
    insert into public.match_results(match_id, winner, end_reason, ended_at, cleanup_after)
      values (p_match_id, v_winner, v_reason, v_now, v_now + interval '7 days')
      on conflict (match_id) do nothing;
  end if;
  return jsonb_build_object('accepted', true, 'tag_id', v_tag_id, 'accepted_at', v_now,
    'state', case when v_winner is null then 'ACTIVE' else 'ENDED' end,
    'winner', v_winner, 'active_counts', jsonb_build_object('hunters', v_hunters, 'runners', v_runners));
end;
$$;

revoke all on function public.xzones_issue_qr(uuid, uuid, bytea) from public, anon, authenticated;
revoke all on function public.xzones_scan_qr(uuid, uuid, bytea) from public, anon, authenticated;
revoke all on function public.xzones_confirm_tag(uuid, uuid) from public, anon, authenticated;
grant execute on function public.xzones_issue_qr(uuid, uuid, bytea) to service_role;
grant execute on function public.xzones_scan_qr(uuid, uuid, bytea) to service_role;
grant execute on function public.xzones_confirm_tag(uuid, uuid) to service_role;
