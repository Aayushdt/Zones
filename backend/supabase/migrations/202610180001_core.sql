-- XZones Phase A core tables. Private gameplay data is accessed only through
-- the server-side api Edge Function; no client table grants are made here.

create type public.match_state as enum (
  'LOBBY', 'HEAD_START', 'ACTIVE', 'ENDED', 'CANCELLED'
);

create type public.player_role as enum ('HUNTER', 'RUNNER');
create type public.player_status as enum ('ACTIVE', 'TAGGED', 'LEFT');
create type public.tag_method as enum ('QR', 'RUNNER_CONFIRM');

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  host_player_id uuid,
  controller_player_id uuid,
  claim_expires_at timestamptz,
  state public.match_state not null default 'LOBBY',
  round_seconds integer not null check (round_seconds between 600 and 10800),
  head_start_seconds integer not null check (head_start_seconds between 0 and 900),
  ping_seconds integer check (ping_seconds is null or ping_seconds between 60 and 1800),
  zone_lat double precision,
  zone_lon double precision,
  zone_radius_m integer,
  started_at timestamptz,
  head_start_ends_at timestamptz,
  ends_at timestamptz,
  last_ping_index integer not null default -1 check (last_ping_index >= -1),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint matches_zone_bounds check (
    (zone_lat is null and zone_lon is null and zone_radius_m is null)
    or (
      zone_lat between -90 and 90
      and zone_lon between -180 and 180
      and zone_radius_m between 200 and 1500
    )
  )
);

create index matches_state_deadline_idx on public.matches(state, ends_at);
create index matches_expiry_idx on public.matches(expires_at);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  role public.player_role,
  status public.player_status not null default 'ACTIVE',
  ready boolean not null default false,
  session_cap_hash bytea not null check (octet_length(session_cap_hash) = 32),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (match_id, auth_user_id),
  unique (match_id, id)
);

create index players_match_role_idx on public.players(match_id, role, status);
create index players_auth_user_idx on public.players(auth_user_id);

alter table public.matches
  add constraint matches_host_player_fk
    foreign key (id, host_player_id) references public.players(match_id, id)
    on delete set null (host_player_id),
  add constraint matches_controller_player_fk
    foreign key (id, controller_player_id) references public.players(match_id, id)
    on delete set null (controller_player_id);

create table public.latest_fix (
  player_id uuid primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  accuracy_m real not null check (accuracy_m between 0 and 10000),
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  sequence bigint not null check (sequence >= 0),
  unique (match_id, player_id),
  foreign key (match_id, player_id)
    references public.players(match_id, id) on delete cascade
);

create index latest_fix_match_received_idx on public.latest_fix(match_id, received_at);

create table public.ping_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  runner_id uuid not null,
  ping_index integer not null check (ping_index >= 0),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  accuracy_m real not null check (accuracy_m between 0 and 10000),
  captured_at timestamptz not null,
  ping_at timestamptz not null,
  unique (match_id, runner_id, ping_index),
  foreign key (match_id, runner_id)
    references public.players(match_id, id) on delete cascade
);

create index ping_snapshots_match_time_idx
  on public.ping_snapshots(match_id, ping_at desc);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  hunter_id uuid,
  runner_id uuid not null,
  method public.tag_method not null,
  accepted_at timestamptz not null default now(),
  unique (match_id, runner_id),
  check (hunter_id is null or hunter_id <> runner_id),
  check (
    (method = 'QR' and hunter_id is not null)
    or (method = 'RUNNER_CONFIRM' and hunter_id is null)
  ),
  foreign key (match_id, runner_id)
    references public.players(match_id, id) on delete cascade,
  foreign key (match_id, hunter_id)
    references public.players(match_id, id) on delete cascade
);

create table public.qr_challenges (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  runner_id uuid not null,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (match_id, runner_id)
    references public.players(match_id, id) on delete cascade
);

create index qr_expiry_idx on public.qr_challenges(expires_at);

create table public.rate_limits (
  bucket_key bytea not null check (octet_length(bucket_key) = 32),
  action text not null check (char_length(action) between 1 and 40),
  window_started_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  primary key (bucket_key, action, window_started_at)
);

create index rate_limits_expiry_idx on public.rate_limits(expires_at);

create table public.match_results (
  match_id uuid primary key references public.matches(id) on delete cascade,
  winner public.player_role,
  end_reason text not null check (char_length(end_reason) between 1 and 80),
  ended_at timestamptz not null,
  cleanup_after timestamptz not null
);

create index results_cleanup_idx on public.match_results(cleanup_after);

-- Keep browser roles from reading full rows (including code/capability hashes).
-- Safe read views and membership RPCs are introduced with the API/RLS steps.
alter table public.matches enable row level security;
alter table public.players enable row level security;
alter table public.latest_fix enable row level security;
alter table public.ping_snapshots enable row level security;
alter table public.tags enable row level security;
alter table public.qr_challenges enable row level security;
alter table public.rate_limits enable row level security;
alter table public.match_results enable row level security;

revoke all on public.matches, public.players, public.latest_fix,
  public.ping_snapshots, public.tags, public.qr_challenges,
  public.rate_limits, public.match_results from anon, authenticated;
