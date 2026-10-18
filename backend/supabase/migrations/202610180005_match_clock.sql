create or replace function public.xzones_match_clock(p_auth_user_id uuid, p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_server_now timestamptz := clock_timestamp();
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if not exists (select 1 from public.players where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE') then
    return jsonb_build_object('error', 'NOT_MEMBER');
  end if;
  return jsonb_build_object(
    'state', v_match.state,
    'server_now', v_server_now,
    'start_at', v_match.started_at,
    'head_start_ends_at', v_match.head_start_ends_at,
    'ends_at', v_match.ends_at,
    'revision', v_match.revision
  );
end;
$$;

revoke all on function public.xzones_match_clock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.xzones_match_clock(uuid, uuid) to service_role;
