alter table public.players
  add column zone_outside_samples integer not null default 0 check (zone_outside_samples between 0 and 2),
  add column zone_outside_since timestamptz,
  add column zone_warning_at timestamptz,
  add column zone_revealed_at timestamptz;

create or replace function public.xzones_track_zone_sample()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_zone jsonb;
  v_center jsonb;
  v_radius double precision;
  v_distance double precision;
  v_since timestamptz;
  v_count integer;
  v_role public.player_role;
begin
  v_zone := public.xzones_zone_at(new.match_id, new.received_at);
  if coalesce((v_zone->>'enabled')::boolean, false) is not true then return new; end if;
  select role into v_role from public.players where id = new.player_id and match_id = new.match_id and status = 'ACTIVE';
  if v_role is distinct from 'RUNNER'::public.player_role then return new; end if;
  v_center := v_zone->'center';
  v_radius := (v_zone->>'radius')::double precision;
  v_distance := 6371000 * 2 * asin(sqrt(
    power(sin(radians(new.lat - (v_center->>'lat')::double precision) / 2), 2)
    + cos(radians((v_center->>'lat')::double precision)) * cos(radians(new.lat))
    * power(sin(radians(new.lon - (v_center->>'lon')::double precision) / 2), 2)
  ));

  if v_distance - new.accuracy_m > v_radius then
    update public.players
      set zone_outside_samples = least(2, zone_outside_samples + 1),
          zone_outside_since = coalesce(zone_outside_since, new.received_at)
      where id = new.player_id
      returning zone_outside_samples, zone_outside_since into v_count, v_since;
    if v_count >= 2 then
      update public.players set zone_revealed_at = coalesce(zone_revealed_at, new.received_at) where id = new.player_id;
    end if;
    if new.received_at >= v_since + interval '120 seconds' then
      update public.players set status = 'TAGGED', ready = false where id = new.player_id and status = 'ACTIVE';
      delete from public.latest_fix where match_id = new.match_id and player_id = new.player_id;
    elsif new.received_at >= v_since + interval '30 seconds' then
      update public.players set zone_warning_at = coalesce(zone_warning_at, new.received_at) where id = new.player_id;
    end if;
  else
    update public.players set zone_outside_samples = 0, zone_outside_since = null, zone_warning_at = null
      where id = new.player_id;
  end if;
  return new;
end;
$$;

create trigger xzones_track_zone_sample
  after insert or update of lat, lon, accuracy_m, captured_at on public.latest_fix
  for each row execute function public.xzones_track_zone_sample();

create or replace function public.xzones_zone_status(p_auth_user_id uuid, p_match_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select case when p.status = 'ACTIVE' or p.status = 'TAGGED' then jsonb_build_object(
    'warning', p.zone_warning_at is not null,
    'revealed', p.zone_revealed_at is not null,
    'eliminated', p.status = 'TAGGED' and p.zone_outside_since is not null
  ) else jsonb_build_object('error', 'NOT_MEMBER') end
  from public.players p where p.match_id = p_match_id and p.auth_user_id = p_auth_user_id
  limit 1
$$;

revoke all on function public.xzones_track_zone_sample() from public, anon, authenticated;
revoke all on function public.xzones_zone_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.xzones_zone_status(uuid, uuid) to service_role;
