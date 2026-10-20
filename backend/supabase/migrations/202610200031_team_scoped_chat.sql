create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null,
  player_role public.player_role,
  body text not null check (char_length(body) between 1 and 280 and body = btrim(body)),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (match_id, player_id) references public.players(match_id, id) on delete cascade
);

create index if not exists chat_messages_match_time_idx on public.chat_messages(match_id, id desc);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from public, anon, authenticated;
alter table public.players add column if not exists last_chat_at timestamptz;

create or replace function public.xzones_send_chat_message(
  p_auth_user_id uuid,
  p_match_id uuid,
  p_body text,
  p_max_characters integer,
  p_minimum_interval_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player public.players%rowtype;
  v_body text := btrim(p_body);
  v_id bigint;
  v_created_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_max_characters is null or p_max_characters < 1 or p_max_characters > 280
    or p_minimum_interval_seconds is null or p_minimum_interval_seconds < 1 or p_minimum_interval_seconds > 60
    or v_body is null or char_length(v_body) < 1 or char_length(v_body) > p_max_characters then
    return jsonb_build_object('error', 'INVALID_INPUT');
  end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  select * into v_player from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE' for update;
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;
  if v_match.state not in ('LOBBY', 'HEAD_START', 'ACTIVE') then return jsonb_build_object('error', 'INVALID_STATE'); end if;
  if v_match.state <> 'LOBBY' and v_player.role is null then return jsonb_build_object('error', 'TEAM_NOT_SELECTED'); end if;
  if v_player.last_chat_at is not null and v_player.last_chat_at > v_now - make_interval(secs => p_minimum_interval_seconds) then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;
  insert into public.chat_messages(match_id, player_id, player_role, body)
    values (p_match_id, v_player.id, v_player.role, v_body)
    returning id, created_at into v_id, v_created_at;
  update public.players set last_chat_at = v_now where id = v_player.id;
  return jsonb_build_object('id', v_id, 'player_id', v_player.id, 'author', v_player.display_name,
    'role', v_player.role, 'body', v_body, 'created_at', v_created_at);
end;
$$;

create or replace function public.xzones_list_chat(p_auth_user_id uuid, p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.matches%rowtype;
  v_player public.players%rowtype;
  v_messages jsonb;
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  select * into v_player from public.players
    where match_id = p_match_id and auth_user_id = p_auth_user_id and status = 'ACTIVE';
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;
  if v_match.state not in ('LOBBY', 'HEAD_START', 'ACTIVE') then return jsonb_build_object('error', 'INVALID_STATE'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'player_id', c.player_id, 'author', p.display_name,
    'role', c.player_role, 'body', c.body, 'created_at', c.created_at) order by c.id), '[]'::jsonb)
    into v_messages
    from (select * from public.chat_messages where match_id = p_match_id
      and (v_match.state = 'LOBBY' or player_role = v_player.role)
      order by id desc limit 50) c
    join public.players p on p.id = c.player_id;
  return jsonb_build_object('messages', v_messages);
end;
$$;

create or replace function public.xzones_purge_chat_on_finish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (old.state = 'LOBBY' and new.state <> 'LOBBY')
    or (new.state in ('ENDED', 'CANCELLED') and old.state not in ('ENDED', 'CANCELLED')) then
    delete from public.chat_messages where match_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists xzones_purge_chat_on_finish on public.matches;
create trigger xzones_purge_chat_on_finish
  after update of state on public.matches
  for each row execute function public.xzones_purge_chat_on_finish();

revoke all on function public.xzones_send_chat_message(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.xzones_send_chat_message(uuid, uuid, text, integer, integer) to service_role;
revoke all on function public.xzones_list_chat(uuid, uuid) from public, anon, authenticated;
grant execute on function public.xzones_list_chat(uuid, uuid) to service_role;
revoke all on function public.xzones_purge_chat_on_finish() from public, anon, authenticated;
