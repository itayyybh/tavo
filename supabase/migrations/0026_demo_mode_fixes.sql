-- Demo mode fixes (after the first real test, 2026-11-04).
--
-- 1. "Today" was computed in UTC when the template restaurant has no timezone.
--    Late in the Israeli evening UTC is still yesterday, so the copied
--    reservations landed on yesterday and the app's end-of-day reset swept them
--    straight into History. Fall back to Asia/Jerusalem (the app's market), the
--    same fallback the seed script uses. Setting restaurants.timezone on the
--    template is still the cleanest fix.
-- 2. Copies always start with active (un-archived) reservations, even if the
--    template's own reservations were archived by an end-of-day reset.

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
  v_shift := (now() at time zone coalesce(v_tz, 'Asia/Jerusalem'))::date - v_template_day;

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
               'archived', false,
               'archived_at', null,
               'archive_reason', null,
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
