alter type public.tag_method add value if not exists 'GPS';
alter table public.tags drop constraint tags_check1;
alter table public.tags add constraint tags_method_hunter_check check (
  (method in ('QR', 'GPS') and hunter_id is not null)
  or (method = 'RUNNER_CONFIRM' and hunter_id is null)
);

create or replace function public.xzones_gps_tag(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_bucket_key bytea,
  p_lat double precision,
  p_lon double precision,
  p_accuracy_m real,
  p_captured_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_hunter_id uuid;
  v_runner_id uuid;
  v_runner_accuracy real;
  v_runner_captured_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_distance double precision;
  v_limit double precision;
  v_age double precision;
  v_tag_id uuid;
  v_hunters integer;
  v_runners integer;
begin
  if p_lat is null or p_lat not between -90 and 90 or p_lon is null or p_lon not between -180 and 180
    or p_accuracy_m is null or p_accuracy_m < 0 or p_accuracy_m > 50
    or p_captured_at is null or p_captured_at > v_now
    or p_captured_at < v_now - interval '5 seconds' then
    return jsonb_build_object('error', 'INVALID_HUNTER_FIX');
  end if;
  if not public.xzones_consume_rate_limit(p_bucket_key, 'hunter_gps_tag', 2, 1) then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_match.state <> 'ACTIVE' or (v_match.ends_at is not null and v_now >= v_match.ends_at) then
    return jsonb_build_object('error', 'INACTIVE');
  end if;
  select id into v_hunter_id from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and role = 'HUNTER' and status = 'ACTIVE';
  if not found then return jsonb_build_object('error', 'WRONG_ROLE'); end if;

  select runner.id, fix.accuracy_m, fix.captured_at,
    6371000 * 2 * asin(sqrt(
      power(sin(radians(fix.lat - p_lat) / 2), 2)
      + cos(radians(p_lat)) * cos(radians(fix.lat)) * power(sin(radians(fix.lon - p_lon) / 2), 2)
    ))
  into v_runner_id, v_runner_accuracy, v_runner_captured_at, v_distance
  from public.players runner join public.latest_fix fix
    on fix.match_id = runner.match_id and fix.player_id = runner.id
  where runner.match_id = p_match_id and runner.role = 'RUNNER' and runner.status = 'ACTIVE'
    and fix.captured_at >= v_now - interval '30 seconds'
  order by 4 asc
  limit 1
  for update of runner;

  if v_runner_id is null then return jsonb_build_object('accepted', false, 'reason', 'NOTHING_IN_RANGE', 'state', 'ACTIVE'); end if;
  v_age := greatest(0, extract(epoch from (v_now - v_runner_captured_at)));
  v_limit := 20 + least(p_accuracy_m + v_runner_accuracy, 25) + 3 * least(v_age, 30);
  if v_distance > v_limit then return jsonb_build_object('accepted', false, 'reason', 'NOTHING_IN_RANGE', 'state', 'ACTIVE'); end if;

  insert into public.tags(match_id, hunter_id, runner_id, method, accepted_at)
    values (p_match_id, v_hunter_id, v_runner_id, 'GPS', v_now) returning id into v_tag_id;
  update public.players set status = 'TAGGED', ready = false where id = v_runner_id;
  delete from public.latest_fix where match_id = p_match_id and player_id = v_runner_id;
  update public.matches set revision = revision + 1 where id = p_match_id;
  select count(*) filter (where role = 'HUNTER'), count(*) filter (where role = 'RUNNER')
    into v_hunters, v_runners from public.players where match_id = p_match_id and status = 'ACTIVE';
  if v_runners = 0 then
    perform public.xzones_finish_match(p_match_id, 'HUNTER', 'ALL_RUNNERS_TAGGED_OR_LEFT', v_now);
  end if;
  return jsonb_build_object('accepted', true, 'tag_id', v_tag_id, 'state',
    case when v_runners = 0 then 'ENDED' else 'ACTIVE' end,
    'winner', case when v_runners = 0 then 'HUNTER' else null end,
    'active_counts', jsonb_build_object('hunters', v_hunters, 'runners', v_runners));
end;
$$;

revoke all on function public.xzones_gps_tag(uuid, uuid, bytea, double precision, double precision, real, timestamptz) from public, anon, authenticated;
grant execute on function public.xzones_gps_tag(uuid, uuid, bytea, double precision, double precision, real, timestamptz) to service_role;
