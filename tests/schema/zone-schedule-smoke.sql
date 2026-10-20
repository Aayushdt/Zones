begin;

do $$
declare
  v_id uuid := gen_random_uuid();
  v_start timestamptz := '2026-10-20 12:00:00+00';
  v_zone jsonb;
begin
  insert into public.matches (
    id, code_hash, state, round_seconds, head_start_seconds, zone_lat, zone_lon, zone_radius_m,
    started_at, head_start_ends_at, ends_at, zone_shrink_stages,
    zone_shrink_interval_seconds, zone_final_radius_m, expires_at
  ) values (
    v_id, decode(repeat('f', 64), 'hex'), 'ACTIVE', 1800, 120, 12, 77, 500,
    v_start, v_start + interval '120 seconds', v_start + interval '1800 seconds', 2,
    300, 100, v_start + interval '2 hours'
  );

  v_zone := public.xzones_zone_at(v_id, v_start + interval '419 seconds');
  if (v_zone->>'stage')::integer <> 0 or (v_zone->>'radius')::numeric <> 500
     or (v_zone->>'nextShrinkAt')::timestamptz <> v_start + interval '420 seconds' then
    raise exception 'zone schedule before first boundary is incorrect: %', v_zone;
  end if;
  v_zone := public.xzones_zone_at(v_id, v_start + interval '420 seconds');
  if (v_zone->>'stage')::integer <> 1 or (v_zone->>'radius')::numeric <> 300
     or (v_zone->>'nextRadius')::numeric <> 100 then
    raise exception 'zone first stage is incorrect: %', v_zone;
  end if;
  v_zone := public.xzones_zone_at(v_id, v_start + interval '720 seconds');
  if (v_zone->>'stage')::integer <> 2 or (v_zone->>'radius')::numeric <> 100
     or v_zone->>'nextShrinkAt' is not null then
    raise exception 'zone final stage is incorrect: %', v_zone;
  end if;
end;
$$;

rollback;
