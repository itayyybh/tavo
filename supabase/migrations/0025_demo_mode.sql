-- Demo mode — let portfolio visitors explore Tavo without signing up.
--
-- How it works:
--   1. The visitor clicks "Try the live demo" and gets an anonymous Supabase
--      session (Auth -> "Allow anonymous sign-ins" must be ON in the dashboard).
--   2. `start_demo()` gives that guest their OWN copy of a template restaurant
--      (fake venue, fake reservations) and makes them its owner.
--   3. Existing RLS is membership-based, so the guest can see and change only
--      their copy — never a real restaurant's data. No policy changes needed.
--   4. `cleanup_demos()` (hourly via pg_cron) deletes copies and guest users
--      older than 24 hours.
--
-- Per-guest copies (instead of one shared demo account) mean visitors can't
-- break the demo for each other and nothing needs a nightly reset.
--
-- Setup after applying this migration (one time, see docs/demo-mode.md):
--   - build the template venue in the app with a normal account,
--   - insert its id into demo_config.

-- ---------------------------------------------------------------------------
-- Mark demo copies so cleanup can never touch a real restaurant.
-- ---------------------------------------------------------------------------
alter table restaurants add column if not exists is_demo boolean not null default false;

-- ---------------------------------------------------------------------------
-- Which restaurant is the template, and which day its reservations were
-- planned for (they are shifted to "today" in each copy). Single row.
-- RLS on with no policies: invisible to every client role.
-- ---------------------------------------------------------------------------
create table if not exists demo_config (
  id                     smallint primary key default 1 check (id = 1),
  template_restaurant_id text not null references restaurants (id) on delete cascade,
  template_day           date not null
);
alter table demo_config enable row level security;

-- ---------------------------------------------------------------------------
-- Rewrite every template id inside a row's JSON to its copy's id.
-- Ids are matched as whole quoted JSON strings ("<id>"), so this also remaps
-- ids stored as foreign keys (tables.zone_id, tables.type_id), inside arrays
-- (table_connections.table_ids) and as JSON keys (floor_state overrides).
-- Internal helper — not callable by clients.
-- ---------------------------------------------------------------------------
create or replace function public.demo_remap(p jsonb, p_ids text[], p_suffix text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text := p::text;
  v_id   text;
begin
  foreach v_id in array p_ids loop
    v_text := replace(v_text, '"' || v_id || '"', '"' || v_id || p_suffix || '"');
  end loop;
  return v_text::jsonb;
end;
$$;

revoke all on function public.demo_remap(jsonb, text[], text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Give the calling guest their own copy of the template restaurant.
-- Guests only (anonymous sessions); idempotent — a guest who already has a
-- restaurant gets that one back. Returns the restaurant id.
-- Rows are copied through jsonb_populate_record, so columns added by future
-- migrations are copied automatically.
-- ---------------------------------------------------------------------------
create or replace function public.start_demo()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_existing     text;
  v_template     text;
  v_template_day date;
  v_new          text := gen_random_uuid()::text;
  v_suffix       text;
  v_ids          text[];
  v_tz           text;
  v_shift        integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'the demo is only for guest sessions';
  end if;

  select restaurant_id into v_existing from memberships where user_id = v_uid limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  select template_restaurant_id, template_day
    into v_template, v_template_day
    from demo_config
   where id = 1;
  if v_template is null then
    raise exception 'the demo is not configured';
  end if;

  v_suffix := '-d' || substr(md5(v_new), 1, 8);

  select coalesce(array_agg(id), '{}') into v_ids from (
    select id from zones             where restaurant_id = v_template
    union all
    select id from table_types       where restaurant_id = v_template
    union all
    select id from tables            where restaurant_id = v_template
    union all
    select id from table_connections where restaurant_id = v_template
    union all
    select id from obstacles         where restaurant_id = v_template
    union all
    select id from reservations      where restaurant_id = v_template
  ) s;

  -- Reservations move from the template day to the restaurant's "today".
  select timezone into v_tz from restaurants where id = v_template;
  v_shift := (now() at time zone coalesce(v_tz, 'UTC'))::date - v_template_day;

  insert into restaurants
  select (jsonb_populate_record(null::restaurants, to_jsonb(t)
          || jsonb_build_object('id', v_new, 'is_demo', true, 'created_at', now()))).*
    from restaurants t where t.id = v_template;

  insert into memberships (id, user_id, restaurant_id, role)
  values (gen_random_uuid()::text, v_uid, v_new, 'owner');

  insert into restaurant_settings
  select (jsonb_populate_record(null::restaurant_settings,
          demo_remap(to_jsonb(t), v_ids, v_suffix)
          || jsonb_build_object('restaurant_id', v_new))).*
    from restaurant_settings t where t.restaurant_id = v_template;

  insert into zones
  select (jsonb_populate_record(null::zones,
          demo_remap(to_jsonb(t), v_ids, v_suffix)
          || jsonb_build_object('restaurant_id', v_new, 'created_at', now()))).*
    from zones t where t.restaurant_id = v_template;

  insert into table_types
  select (jsonb_populate_record(null::table_types,
          demo_remap(to_jsonb(t), v_ids, v_suffix)
          || jsonb_build_object('restaurant_id', v_new, 'created_at', now()))).*
    from table_types t where t.restaurant_id = v_template;

  insert into tables
  select (jsonb_populate_record(null::tables,
          demo_remap(to_jsonb(t), v_ids, v_suffix)
          || jsonb_build_object('restaurant_id', v_new, 'created_at', now()))).*
    from tables t where t.restaurant_id = v_template;

  insert into table_connections
  select (jsonb_populate_record(null::table_connections,
          demo_remap(to_jsonb(t), v_ids, v_suffix)
          || jsonb_build_object('restaurant_id', v_new, 'created_at', now()))).*
    from table_connections t where t.restaurant_id = v_template;

  insert into obstacles
  select (jsonb_populate_record(null::obstacles,
          demo_remap(to_jsonb(t), v_ids, v_suffix)
          || jsonb_build_object('restaurant_id', v_new, 'created_at', now()))).*
    from obstacles t where t.restaurant_id = v_template;

  insert into reservations
  select (jsonb_populate_record(null::reservations,
          demo_remap(to_jsonb(t), v_ids, v_suffix)
          || jsonb_build_object(
               'restaurant_id', v_new,
               'date_time', t.date_time + make_interval(days => v_shift),
               'created_at', now(),
               'updated_at', now()))).*
    from reservations t where t.restaurant_id = v_template;

  insert into floor_state
  select (jsonb_populate_record(null::floor_state,
          demo_remap(to_jsonb(t), v_ids, v_suffix)
          || jsonb_build_object('restaurant_id', v_new, 'updated_at', now()))).*
    from floor_state t where t.restaurant_id = v_template;

  return v_new;
end;
$$;

revoke all on function public.start_demo() from public, anon;
grant execute on function public.start_demo() to authenticated;

-- ---------------------------------------------------------------------------
-- Guests must not create real restaurants. Same body as 0002, plus the guest
-- check (a guest whose demo failed would otherwise land on onboarding).
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_restaurant(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_restaurant_id text := gen_random_uuid()::text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'guest sessions cannot create a restaurant';
  end if;

  if exists (select 1 from memberships where user_id = v_uid) then
    raise exception 'user already belongs to a restaurant';
  end if;

  insert into restaurants (id, name) values (v_restaurant_id, p_name);

  insert into memberships (id, user_id, restaurant_id, role)
  values (gen_random_uuid()::text, v_uid, v_restaurant_id, 'owner');

  insert into restaurant_settings (restaurant_id, seating)
  values (v_restaurant_id, '{}'::jsonb)
  on conflict (restaurant_id) do nothing;

  return v_restaurant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete demo copies and guest users older than 24 hours. Deleting the
-- restaurant cascades to everything it owns. A guest is only deleted when
-- they belong to no real restaurant.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_demos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from restaurants
   where is_demo
     and created_at < now() - interval '24 hours';

  delete from auth.users u
   where u.is_anonymous
     and u.created_at < now() - interval '24 hours'
     and not exists (
       select 1
         from memberships m
         join restaurants r on r.id = m.restaurant_id
        where m.user_id = u.id
          and not r.is_demo
     );
end;
$$;

revoke all on function public.cleanup_demos() from public, anon, authenticated;

-- Hourly cleanup. Needs the pg_cron extension (Database -> Extensions).
create extension if not exists pg_cron;
select cron.schedule('tavo-demo-cleanup', '17 * * * *', $$select public.cleanup_demos()$$);
