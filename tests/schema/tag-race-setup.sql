begin;

insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
insert into public.matches (id, code_hash, state, round_seconds, head_start_seconds, started_at,
  head_start_ends_at, ends_at, expires_at)
values ('20000000-0000-4000-8000-000000000001', decode(repeat('f', 64), 'hex'), 'ACTIVE', 1800, 0,
  clock_timestamp() - interval '1 minute', clock_timestamp() - interval '1 minute',
  clock_timestamp() + interval '30 minutes', clock_timestamp() + interval '2 hours');
insert into public.players (id, match_id, auth_user_id, display_name, role, session_cap_hash)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'Race Hunter', 'HUNTER', decode(repeat('1', 64), 'hex')),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002', 'Race Runner', 'RUNNER', decode(repeat('2', 64), 'hex'));
update public.matches set host_player_id = '10000000-0000-4000-8000-000000000001',
  controller_player_id = '10000000-0000-4000-8000-000000000001'
  where id = '20000000-0000-4000-8000-000000000001';
insert into public.qr_challenges(match_id, runner_id, token_hash, expires_at)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  decode(repeat('a', 64), 'hex'), clock_timestamp() + interval '60 seconds');
insert into public.latest_fix (match_id, player_id, lat, lon, accuracy_m, captured_at, received_at, sequence)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 0, 0, 5, clock_timestamp(), clock_timestamp(), 1),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 0.0001, 0, 5, clock_timestamp(), clock_timestamp(), 1);

commit;
