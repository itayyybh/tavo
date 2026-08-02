-- Phase 9 — Multi-tenant schema for the Restaurant Floor Manager.
--
-- Design notes:
--  * Text primary keys everywhere. The app's domain model is `type ID = string`
--    (client-minted via `createId`), and reservations reference tables/zones by
--    plain id strings. Text ids keep the existing decoupled model intact and make
--    the localStorage -> DB migration a straight insert with no id remapping.
--  * Geometry (position/size/points) is stored as jsonb to mirror the in-memory
--    Vec2 shape 1:1 — the repository layer maps rows <-> domain objects with no
--    reshaping. Normalizing to numeric columns buys nothing at this scale.
--  * Tenant isolation is enforced by Row-Level Security below, NOT by the client.
--    Every tenant-owned row carries `restaurant_id` and is gated on membership.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create type membership_role as enum ('owner', 'manager');

-- ---------------------------------------------------------------------------
-- Core tenancy tables
-- ---------------------------------------------------------------------------
create table restaurants (
  id         text primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

-- Profile mirror of auth.users (Supabase owns auth; this holds app-facing fields).
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  email      text,
  created_at timestamptz not null default now()
);

create table memberships (
  id            text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  restaurant_id text not null references restaurants (id) on delete cascade,
  role          membership_role not null default 'manager',
  created_at    timestamptz not null default now(),
  unique (user_id, restaurant_id)
);
create index memberships_user_idx on memberships (user_id);
create index memberships_restaurant_idx on memberships (restaurant_id);

-- ---------------------------------------------------------------------------
-- Membership helper — used by every RLS policy. SECURITY DEFINER so the policy
-- check can read `memberships` without recursing through its own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_restaurant_member(rid text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.restaurant_id = rid
      and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Layout / configuration tables (owned by the restaurant)
-- ---------------------------------------------------------------------------
create table zones (
  id                      text primary key,
  restaurant_id           text not null references restaurants (id) on delete cascade,
  name                    text not null,
  color                   text not null default '#f5f5f5',
  position                jsonb not null,
  size                    jsonb not null,
  parent_id               text,
  smoking                 text,   -- 'smoking' | 'non-smoking' | null
  allow_table_relocation  boolean,
  created_at              timestamptz not null default now()
);
create index zones_restaurant_idx on zones (restaurant_id);

create table table_types (
  id                 text primary key,
  restaurant_id      text not null references restaurants (id) on delete cascade,
  name               text not null,
  shape              text not null,   -- 'square' | 'round' | 'rectangle'
  default_size       jsonb not null,
  clearance          numeric not null default 0,
  solo_capacity      integer not null,
  connected_capacity integer not null,
  created_at         timestamptz not null default now()
);
create index table_types_restaurant_idx on table_types (restaurant_id);

create table tables (
  id               text primary key,
  restaurant_id    text not null references restaurants (id) on delete cascade,
  zone_id          text not null default '',
  type_id          text not null,
  label            text not null,
  position         jsonb not null,
  size             jsonb not null,
  rotation         numeric not null default 0,
  status           text not null default 'available',
  merged_group_id  text,
  zone_pinned      boolean,
  created_at       timestamptz not null default now()
);
create index tables_restaurant_idx on tables (restaurant_id);

-- Design-time merged groups (the editor's persistent merges).
create table table_connections (
  id            text primary key,
  restaurant_id text not null references restaurants (id) on delete cascade,
  table_ids     text[] not null,
  seats         integer,
  clearance     numeric,
  created_at    timestamptz not null default now()
);
create index table_connections_restaurant_idx on table_connections (restaurant_id);

create table obstacles (
  id            text primary key,
  restaurant_id text not null references restaurants (id) on delete cascade,
  kind          text not null,   -- 'wall' | 'object' | 'path'
  label         text,
  position      jsonb not null,
  size          jsonb not null,
  rotation      numeric not null default 0,
  points        jsonb,
  brush_width   numeric,
  created_at    timestamptz not null default now()
);
create index obstacles_restaurant_idx on obstacles (restaurant_id);

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------
create table reservations (
  id                  text primary key,
  restaurant_id       text not null references restaurants (id) on delete cascade,
  guest_name          text not null,
  phone               text,
  email               text,
  party_size          integer not null,
  date_time           timestamptz not null,
  estimated_duration  integer not null,
  preferred_zone_id   text,
  preferred_table_id  text,
  assigned_table_ids  text[],
  occasion            text,
  status              text not null default 'pending',
  source              text not null default 'manual',
  preferences         jsonb,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index reservations_restaurant_idx on reservations (restaurant_id);
create index reservations_datetime_idx on reservations (restaurant_id, date_time);

-- ---------------------------------------------------------------------------
-- Live Floor runtime state (Phase 8)
--  * Seatings are normalized into their own table so Realtime can stream them.
--  * The remaining override maps live in a single per-restaurant jsonb row —
--    they are a coherent snapshot the floor rewrites as a unit.
-- ---------------------------------------------------------------------------
create table seatings (
  id             text primary key,
  restaurant_id  text not null references restaurants (id) on delete cascade,
  reservation_id text not null references reservations (id) on delete cascade,
  table_ids      text[] not null,
  seated_at      timestamptz not null default now()
);
create index seatings_restaurant_idx on seatings (restaurant_id);

create table floor_state (
  restaurant_id      text primary key references restaurants (id) on delete cascade,
  status_overrides   jsonb not null default '{}'::jsonb,
  cleaning_since     jsonb not null default '{}'::jsonb,
  position_overrides jsonb not null default '{}'::jsonb,
  rotation_overrides jsonb not null default '{}'::jsonb,
  runtime_merges     jsonb not null default '[]'::jsonb,
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Per-restaurant settings (seating engine config + floor rules)
-- ---------------------------------------------------------------------------
create table restaurant_settings (
  restaurant_id          text primary key references restaurants (id) on delete cascade,
  seating                jsonb not null,
  grid_size              integer not null default 20,
  snap_to_grid           boolean not null default true,
  path_width             numeric not null default 40,
  auto_turnover          boolean not null default true,
  default_stay_minutes   integer not null default 120,
  max_stay_minutes       integer not null default 120,
  reserved_lookahead_min integer not null default 60,
  waitlist_enabled       boolean not null default true,
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-Level Security — the real tenant boundary.
-- ---------------------------------------------------------------------------
alter table restaurants         enable row level security;
alter table profiles            enable row level security;
alter table memberships         enable row level security;
alter table zones               enable row level security;
alter table table_types         enable row level security;
alter table tables              enable row level security;
alter table table_connections   enable row level security;
alter table obstacles           enable row level security;
alter table reservations        enable row level security;
alter table seatings            enable row level security;
alter table floor_state         enable row level security;
alter table restaurant_settings enable row level security;

-- Profiles: a user manages only their own row.
create policy profiles_self on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Memberships: a user sees only their own membership rows. Inserts/changes to
-- memberships (invites) go through a server-side function, not direct writes.
create policy memberships_self on memberships
  for select using (user_id = auth.uid());

-- Restaurants: visible to members.
create policy restaurants_member_read on restaurants
  for select using (public.is_restaurant_member(id));

-- Every tenant-owned table: full access gated on membership, both directions.
create policy zones_tenant on zones
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy table_types_tenant on table_types
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy tables_tenant on tables
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy table_connections_tenant on table_connections
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy obstacles_tenant on obstacles
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy reservations_tenant on reservations
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy seatings_tenant on seatings
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy floor_state_tenant on floor_state
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy restaurant_settings_tenant on restaurant_settings
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

-- ---------------------------------------------------------------------------
-- Realtime — stream the operational tables the desktop/iPad must see live.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table reservations;
alter publication supabase_realtime add table seatings;
