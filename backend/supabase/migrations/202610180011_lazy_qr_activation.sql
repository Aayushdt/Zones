create or replace function public.xzones_advance_match_state(
  p_auth_user_id uuid,
  p_match_id uuid
) returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.xzones_resolve_match(p_auth_user_id, p_match_id);
$$;

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
  v_advance jsonb;
begin
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    return jsonb_build_object('error', 'INVALID_INPUT');
  end if;

  v_advance := public.xzones_advance_match_state(p_auth_user_id, p_match_id);
  if v_advance ? 'error' then return v_advance; end if;
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

revoke all on function public.xzones_advance_match_state(uuid, uuid) from public, anon, authenticated;
revoke all on function public.xzones_issue_qr(uuid, uuid, bytea) from public, anon, authenticated;
grant execute on function public.xzones_advance_match_state(uuid, uuid) to service_role;
grant execute on function public.xzones_issue_qr(uuid, uuid, bytea) to service_role;
