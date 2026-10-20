create unlogged table public.xzones_load_players (
  slot integer primary key,
  auth_user_id uuid not null,
  match_id uuid not null,
  next_location_at timestamptz not null default clock_timestamp(),
  next_sync_at timestamptz not null default clock_timestamp() + interval '37.5 seconds',
  fix_index integer not null default 0
);

create unlogged table public.xzones_load_requests (
  request_kind text not null,
  has_error boolean not null
);

create unlogged table public.xzones_load_rpc_samples (
  rpc_name text not null,
  latency_ms double precision not null,
  has_error boolean not null
);

create sequence public.xzones_load_sequence;

do $$
declare
  v_match_id uuid := gen_random_uuid();
  v_auth_id uuid;
  v_player_id uuid;
  v_slot integer;
begin
  insert into public.matches (
    id, code_hash, state, round_seconds, head_start_seconds, ping_seconds,
    started_at, head_start_ends_at, ends_at, expires_at
  ) values (
    v_match_id, decode(repeat('a', 64), 'hex'), 'ACTIVE', 2700, 0, null,
    clock_timestamp() - interval '10 minutes', clock_timestamp() - interval '10 minutes',
    clock_timestamp() + interval '1 day', clock_timestamp() + interval '2 days'
  );

  for v_slot in 1..100 loop
    v_auth_id := gen_random_uuid();
    v_player_id := gen_random_uuid();
    insert into auth.users(id) values (v_auth_id);
    insert into public.players(id, match_id, auth_user_id, display_name, role, session_cap_hash)
    values (v_player_id, v_match_id, v_auth_id, 'Load ' || v_slot,
      case when v_slot <= 10 then 'HUNTER'::public.player_role else 'RUNNER'::public.player_role end,
      decode(repeat(lpad(to_hex(v_slot), 2, '0'), 32), 'hex'));
    insert into public.xzones_load_players(slot, auth_user_id, match_id)
    values (v_slot, v_auth_id, v_match_id);
  end loop;
end;
$$;

create or replace function public.xzones_load_record_rpc(
  p_name text,
  p_started_at timestamptz,
  p_result jsonb
) returns boolean
language plpgsql
as $$
declare
  v_error boolean := p_result ? 'error';
begin
  insert into public.xzones_load_rpc_samples(rpc_name, latency_ms, has_error)
  values (p_name, greatest(0, extract(epoch from (clock_timestamp() - p_started_at)) * 1000), v_error);
  return v_error;
end;
$$;

create or replace function public.xzones_load_simulate_request(p_slot integer, p_kind text)
returns void
language plpgsql
as $$
declare
  v_auth_id uuid;
  v_match_id uuid;
  v_fix_index integer;
  v_result jsonb;
  v_started_at timestamptz;
  v_has_error boolean := false;
begin
  select auth_user_id, match_id, fix_index into v_auth_id, v_match_id, v_fix_index
    from public.xzones_load_players where slot = p_slot;
  if not found then raise exception 'Invalid load player slot: %', p_slot; end if;

  if p_kind = 'location' then
    v_started_at := clock_timestamp();
    v_result := public.xzones_resolve_match(v_auth_id, v_match_id);
    v_has_error := public.xzones_load_record_rpc('xzones_resolve_match', v_started_at, v_result) or v_has_error;

    v_started_at := clock_timestamp();
    v_result := public.xzones_update_location(
      v_auth_id, v_match_id, 25.6 + p_slot / 100000.0 + v_fix_index * 0.0002,
      85.1 + p_slot / 100000.0 + v_fix_index * 0.0002,
      8, clock_timestamp(), nextval('public.xzones_load_sequence')
    );
    v_has_error := public.xzones_load_record_rpc('xzones_update_location', v_started_at, v_result) or v_has_error;
  elsif p_kind = 'sync' then
    v_started_at := clock_timestamp();
    v_result := public.xzones_lobby_status(v_match_id);
    v_has_error := public.xzones_load_record_rpc('xzones_lobby_status', v_started_at, v_result) or v_has_error;

    v_started_at := clock_timestamp();
    v_result := public.xzones_sync_match(v_auth_id, v_match_id, 0);
    v_has_error := public.xzones_load_record_rpc('xzones_sync_match', v_started_at, v_result) or v_has_error;

    v_started_at := clock_timestamp();
    v_result := public.xzones_match_controls(v_auth_id, v_match_id);
    v_has_error := public.xzones_load_record_rpc('xzones_match_controls', v_started_at, v_result) or v_has_error;

    v_started_at := clock_timestamp();
    v_result := public.xzones_team_positions(v_auth_id, v_match_id);
    v_has_error := public.xzones_load_record_rpc('xzones_team_positions', v_started_at, v_result) or v_has_error;

    v_started_at := clock_timestamp();
    v_result := public.xzones_match_clock(v_auth_id, v_match_id);
    v_has_error := public.xzones_load_record_rpc('xzones_match_clock', v_started_at, v_result) or v_has_error;
  else
    raise exception 'Invalid load request kind: %', p_kind;
  end if;

  insert into public.xzones_load_requests(request_kind, has_error) values (p_kind, v_has_error);
end;
$$;

create or replace function public.xzones_load_simulate_tick(p_slot integer)
returns void
language plpgsql
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_next_location_at timestamptz;
  v_next_sync_at timestamptz;
  v_fix_index integer;
begin
  select next_location_at, next_sync_at, fix_index
    into v_next_location_at, v_next_sync_at, v_fix_index
    from public.xzones_load_players where slot = p_slot for update;
  if not found then raise exception 'Invalid load player slot: %', p_slot; end if;

  if v_now >= v_next_location_at then
    perform public.xzones_load_simulate_request(p_slot, 'location');
    v_next_location_at := v_next_location_at + interval '10 seconds';
    while v_next_location_at <= v_now loop
      v_next_location_at := v_next_location_at + interval '10 seconds';
    end loop;
    update public.xzones_load_players set next_location_at = v_next_location_at, fix_index = v_fix_index + 1
      where slot = p_slot;
  end if;

  if v_now >= v_next_sync_at then
    perform public.xzones_load_simulate_request(p_slot, 'sync');
    perform public.xzones_load_simulate_request(p_slot, 'sync');
    v_next_sync_at := v_next_sync_at + make_interval(secs => 30 + random() * 15);
    while v_next_sync_at <= v_now loop
      v_next_sync_at := v_next_sync_at + make_interval(secs => 30 + random() * 15);
    end loop;
    update public.xzones_load_players set next_sync_at = v_next_sync_at where slot = p_slot;
  end if;
end;
$$;
