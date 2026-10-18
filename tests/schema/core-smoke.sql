-- Run against a fresh local Supabase database with:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/schema/core-smoke.sql
begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_match_id uuid := gen_random_uuid();
  v_player_id uuid := gen_random_uuid();
begin
  insert into auth.users (id) values (v_user_id);

  insert into public.matches (
    id, code_hash, round_seconds, head_start_seconds, ping_seconds,
    zone_lat, zone_lon, zone_radius_m, expires_at
  ) values (
    v_match_id, decode(repeat('a', 64), 'hex'), 2700, 180, 300,
    42.88, 74.60, 1000, now() + interval '1 day'
  );

  insert into public.players (
    id, match_id, auth_user_id, display_name, session_cap_hash
  ) values (
    v_player_id, v_match_id, v_user_id, 'Schema Test', decode(repeat('b', 64), 'hex')
  );

  update public.matches
    set host_player_id = v_player_id, controller_player_id = v_player_id
    where id = v_match_id;

  begin
    insert into public.matches (code_hash, round_seconds, head_start_seconds, expires_at)
    values (decode(repeat('c', 8), 'hex'), 2700, 0, now() + interval '1 day');
    raise exception 'Expected 32-byte code_hash constraint to reject insert';
  exception when check_violation then null;
  end;

  begin
    insert into public.matches (code_hash, round_seconds, head_start_seconds, expires_at)
    values (decode(repeat('d', 64), 'hex'), 599, 0, now() + interval '1 day');
    raise exception 'Expected round_seconds constraint to reject insert';
  exception when check_violation then null;
  end;

  begin
    insert into public.matches (
      code_hash, round_seconds, head_start_seconds, zone_lat, zone_lon,
      zone_radius_m, expires_at
    ) values (
      decode(repeat('e', 64), 'hex'), 2700, 0, 42.88, 74.60, 199,
      now() + interval '1 day'
    );
    raise exception 'Expected minimum zone_radius_m constraint to reject insert';
  exception when check_violation then null;
  end;

  begin
    insert into public.latest_fix (
      player_id, match_id, lat, lon, accuracy_m, captured_at, sequence
    ) values (
      gen_random_uuid(), v_match_id, 42.88, 74.60, 5, now(), 1
    );
    raise exception 'Expected latest_fix player/match foreign key to reject mismatch';
  exception when foreign_key_violation then null;
  end;
end;
$$;

rollback;
