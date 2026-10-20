alter table public.players
  add column stationary_since timestamptz,
  add column stationary_anchor_lat double precision,
  add column stationary_anchor_lon double precision,
  add column stationary_warning_at timestamptz,
  add column stationary_revealed_at timestamptz;

create or replace function public.xzones_track_stationary_sample()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role public.player_role;
  v_since timestamptz;
  v_anchor_lat double precision;
  v_anchor_lon double precision;
  v_distance double precision;
  v_match_state public.match_state;
begin
  select state into v_match_state from public.matches where id = new.match_id;
  if v_match_state <> 'ACTIVE' then return new; end if;
  select role, stationary_since, stationary_anchor_lat, stationary_anchor_lon
    into v_role, v_since, v_anchor_lat, v_anchor_lon
    from public.players where id = new.player_id and match_id = new.match_id and status = 'ACTIVE' for update;
  if v_role is distinct from 'RUNNER'::public.player_role then return new; end if;
  if v_since is null or v_anchor_lat is null or v_anchor_lon is null then
    update public.players set stationary_since = new.received_at, stationary_anchor_lat = new.lat,
      stationary_anchor_lon = new.lon, stationary_warning_at = null, stationary_revealed_at = null
      where id = new.player_id;
    return new;
  end if;
  v_distance := 6371000 * 2 * asin(sqrt(
    power(sin(radians(new.lat - v_anchor_lat) / 2), 2)
    + cos(radians(v_anchor_lat)) * cos(radians(new.lat))
    * power(sin(radians(new.lon - v_anchor_lon) / 2), 2)
  ));
  if v_distance >= 15 then
    update public.players set stationary_since = new.received_at, stationary_anchor_lat = new.lat,
      stationary_anchor_lon = new.lon, stationary_warning_at = null, stationary_revealed_at = null
      where id = new.player_id;
  else
    if new.received_at >= v_since + interval '240 seconds' then
      update public.players set stationary_warning_at = coalesce(stationary_warning_at, new.received_at)
        where id = new.player_id;
    end if;
    if new.received_at >= v_since + interval '300 seconds' then
      update public.players set stationary_revealed_at = coalesce(stationary_revealed_at, new.received_at)
        where id = new.player_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger xzones_track_stationary_sample
  after insert or update of lat, lon, accuracy_m, captured_at on public.latest_fix
  for each row execute function public.xzones_track_stationary_sample();

create or replace function public.xzones_zone_status(p_auth_user_id uuid, p_match_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select case when p.status = 'ACTIVE' or p.status = 'TAGGED' then jsonb_build_object(
    'warning', p.zone_warning_at is not null or p.stationary_warning_at is not null,
    'zone_warning', p.zone_warning_at is not null,
    'stationary_warning', p.stationary_warning_at is not null,
    'revealed', p.zone_revealed_at is not null or p.stationary_revealed_at is not null,
    'eliminated', p.status = 'TAGGED' and p.zone_outside_since is not null
  ) else jsonb_build_object('error', 'NOT_MEMBER') end
  from public.players p where p.match_id = p_match_id and p.auth_user_id = p_auth_user_id
  limit 1
$$;

revoke all on function public.xzones_track_stationary_sample() from public, anon, authenticated;
revoke all on function public.xzones_zone_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.xzones_zone_status(uuid, uuid) to service_role;
