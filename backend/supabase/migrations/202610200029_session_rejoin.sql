create or replace function public.xzones_find_rejoinable_match(p_auth_user_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select jsonb_build_object('match_id', m.id, 'state', m.state)
      from public.players p join public.matches m on m.id = p.match_id
      where p.auth_user_id = p_auth_user_id and p.status = 'ACTIVE'
        and m.state in ('LOBBY', 'HEAD_START', 'ACTIVE')
      order by coalesce(m.started_at, m.created_at) desc
      limit 1
  ), jsonb_build_object('match_id', null))
$$;

revoke all on function public.xzones_find_rejoinable_match(uuid) from public, anon, authenticated;
grant execute on function public.xzones_find_rejoinable_match(uuid) to service_role;
