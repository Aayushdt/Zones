create or replace function public.xzones_zone_at(p_match_id uuid, p_now timestamptz default clock_timestamp())
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_stage integer;
  v_first timestamptz;
  v_next timestamptz;
  v_radius numeric;
  v_next_radius numeric;
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.zone_lat is null or v_match.zone_lon is null or v_match.zone_radius_m is null then
    return jsonb_build_object('enabled', false);
  end if;
  if v_match.zone_shrink_stages = 0 or v_match.started_at is null then
    return jsonb_build_object('enabled', true, 'center', jsonb_build_object('lat', v_match.zone_lat, 'lon', v_match.zone_lon),
      'radius', v_match.zone_radius_m, 'stage', 0, 'nextShrinkAt', null, 'nextRadius', null);
  end if;
  v_first := v_match.started_at + make_interval(secs => v_match.head_start_seconds
    + v_match.zone_shrink_interval_seconds);
  v_stage := least(v_match.zone_shrink_stages, greatest(0,
    floor(extract(epoch from (p_now - v_first)) / v_match.zone_shrink_interval_seconds)::integer + 1));
  v_radius := v_match.zone_radius_m
    + ((v_match.zone_final_radius_m - v_match.zone_radius_m)::numeric * v_stage / v_match.zone_shrink_stages);
  if v_stage < v_match.zone_shrink_stages then
    v_next := v_first + make_interval(secs => v_stage * v_match.zone_shrink_interval_seconds);
    v_next_radius := v_match.zone_radius_m
      + ((v_match.zone_final_radius_m - v_match.zone_radius_m)::numeric * (v_stage + 1) / v_match.zone_shrink_stages);
  end if;
  return jsonb_build_object('enabled', true, 'center', jsonb_build_object('lat', v_match.zone_lat, 'lon', v_match.zone_lon),
    'radius', v_radius, 'stage', v_stage, 'nextShrinkAt', v_next, 'nextRadius', v_next_radius);
end;
$$;

revoke all on function public.xzones_zone_at(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.xzones_zone_at(uuid, timestamptz) to service_role;
