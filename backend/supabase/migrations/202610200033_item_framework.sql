alter table public.matches
  add column if not exists mode text not null default 'HIDE_AND_SEEK'
    check (mode = 'HIDE_AND_SEEK'),
  add column if not exists items_enabled boolean not null default false;

create table if not exists public.item_uses (
  match_id uuid not null,
  player_id uuid not null,
  item_key text not null check (item_key in ('HUNTER_SCAN','HUNTER_ALARM','HUNTER_ZONE_MOVER','RUNNER_DECOY','RUNNER_ZONE_SHIELD','RUNNER_CAMOUFLAGE')),
  uses_remaining integer not null default 1 check (uses_remaining between 0 and 1),
  cooldown_until timestamptz,
  active_until timestamptz,
  private_state jsonb not null default '{}'::jsonb,
  primary key (match_id, player_id, item_key),
  foreign key (match_id, player_id) references public.players(match_id, id) on delete cascade
);
alter table public.item_uses enable row level security;
revoke all on public.item_uses from public, anon, authenticated, service_role;

create table if not exists public.item_alerts (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null,
  alert_key text not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (match_id, player_id) references public.players(match_id, id) on delete cascade
);
alter table public.item_alerts enable row level security;
revoke all on public.item_alerts from public, anon, authenticated, service_role;

create or replace function public.xzones_set_items_enabled(p_auth_user_id uuid, p_match_id uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.matches%rowtype; p public.players%rowtype;
begin
  select * into m from public.matches where id=p_match_id for update;
  select * into p from public.players where match_id=p_match_id and auth_user_id=p_auth_user_id and status='ACTIVE';
  if m.id is null or p.id is null then
    return jsonb_build_object('error','NOT_CONTROLLER');
  end if;
  if p_enabled is null then return jsonb_build_object('items_enabled',m.items_enabled); end if;
  if p.id <> m.controller_player_id or m.state <> 'LOBBY' then return jsonb_build_object('error','NOT_CONTROLLER'); end if;
  update public.matches set items_enabled=p_enabled, revision=revision+1 where id=p_match_id;
  return jsonb_build_object('items_enabled',p_enabled);
end $$;

create or replace function public.xzones_activate_item(p_auth_user_id uuid, p_match_id uuid, p_item_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.matches%rowtype; p public.players%rowtype; remaining integer;
begin
  select * into m from public.matches where id=p_match_id for update;
  select * into p from public.players where match_id=p_match_id and auth_user_id=p_auth_user_id and status='ACTIVE';
  if m.id is null or p.id is null or m.state <> 'ACTIVE' or not m.items_enabled then
    return jsonb_build_object('error','ITEM_UNAVAILABLE');
  end if;
  if (p.role='HUNTER' and p_item_key not like 'HUNTER_%') or (p.role='RUNNER' and p_item_key not like 'RUNNER_%') then
    return jsonb_build_object('error','ITEM_UNAVAILABLE');
  end if;
  if p_item_key not in ('HUNTER_SCAN','HUNTER_ALARM','HUNTER_ZONE_MOVER','RUNNER_DECOY','RUNNER_ZONE_SHIELD','RUNNER_CAMOUFLAGE') then
    return jsonb_build_object('error','ITEM_UNAVAILABLE');
  end if;
  insert into public.item_uses(match_id,player_id,item_key) values (p_match_id,p.id,p_item_key)
    on conflict (match_id,player_id,item_key) do nothing;
  update public.item_uses set uses_remaining=uses_remaining-1
   where match_id=p_match_id and player_id=p.id and item_key=p_item_key
     and uses_remaining>0 and (cooldown_until is null or cooldown_until<=clock_timestamp())
   returning uses_remaining into remaining;
  if not found then return jsonb_build_object('error','ITEM_UNAVAILABLE'); end if;
  return jsonb_build_object('accepted',true,'uses_remaining',remaining);
end $$;

revoke all on function public.xzones_set_items_enabled(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.xzones_activate_item(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.xzones_set_items_enabled(uuid,uuid,boolean) to service_role;
grant execute on function public.xzones_activate_item(uuid,uuid,text) to service_role;
