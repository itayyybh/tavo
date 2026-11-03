-- Fake reservations for the demo TEMPLATE restaurant, and its demo_config row.
-- Run in the Supabase SQL editor AFTER building the template's layout.
-- Safe to re-run: it replaces the template's reservations each time.
--
-- Everything here is invented: names, phones (050-000-00xx) and notes.
-- Edit the two settings below, then run the whole block.

do $$
declare
  v_restaurant_name text := 'Demo Bistro';      -- the template restaurant's exact name
  v_day             date := date '2026-11-05';  -- the evening these reservations are for
  v_rid             text;
  v_tz              text;
  v_count           integer;
begin
  select count(*) into v_count from restaurants where name = v_restaurant_name and not is_demo;
  if v_count <> 1 then
    raise exception 'expected exactly one restaurant named %, found %', v_restaurant_name, v_count;
  end if;

  select id, coalesce(timezone, 'Asia/Jerusalem')
    into v_rid, v_tz
    from restaurants
   where name = v_restaurant_name and not is_demo;

  delete from reservations where restaurant_id = v_rid;

  insert into reservations (
    id, restaurant_id, guest_name, phone, party_size, date_time, estimated_duration,
    preferred_zone_id, occasion, status, source, preferences, notes
  )
  select
    gen_random_uuid()::text,
    v_rid,
    r.guest_name,
    r.phone,
    r.party_size,
    (v_day + r.at_time) at time zone v_tz,
    r.duration,
    (select z.id from zones z
      where z.restaurant_id = v_rid and r.zone_hint is not null
        and z.name ilike '%' || r.zone_hint || '%'
      limit 1),
    r.occasion,
    r.status,
    'manual',
    r.prefs,
    r.notes
  from (values
    ('Noa Levi',        '050-000-0001', 2, time '18:00',  90, 'terrace', null,          'confirmed', '{"windowSeat": true}'::jsonb, null),
    ('Daniel Cohen',    '050-000-0002', 4, time '18:15', 120, null,      'business',    'confirmed', null,                         'Needs a quiet table'),
    ('Maya Friedman',   '050-000-0003', 2, time '18:30',  90, 'bar',     'date',        'confirmed', null,                         null),
    ('Yossi Mizrahi',   '050-000-0004', 6, time '18:45', 120, 'inside',  'birthday',    'confirmed', '{"highChair": true}'::jsonb,  'Birthday cake at 20:00, one high chair'),
    ('Tamar Shapiro',   '050-000-0005', 3, time '19:00',  90, null,      null,          'pending',   null,                         null),
    ('Ori Ben-David',   '050-000-0006', 2, time '19:00',  90, 'terrace', 'anniversary', 'confirmed', null,                         'Anniversary, a nice corner if possible'),
    ('Liat Avraham',    '050-000-0007', 8, time '19:15', 150, 'inside',  'celebration', 'confirmed', null,                         'Team dinner, will need joined tables'),
    ('Alex Rivera',     '050-000-0008', 2, time '19:30',  90, 'bar',     null,          'confirmed', null,                         null),
    ('Shira Katz',      '050-000-0009', 4, time '19:45', 120, null,      null,          'confirmed', '{"wheelchair": true}'::jsonb, 'Wheelchair access needed'),
    ('Amit Goldberg',   '050-000-0010', 5, time '20:00', 120, 'terrace', null,          'pending',   null,                         null),
    ('Rina Peretz',     '050-000-0011', 2, time '20:15',  90, null,      'date',        'confirmed', '{"allergies": "nuts"}'::jsonb, 'Nut allergy'),
    ('Eitan Rosen',     '050-000-0012', 4, time '20:30', 120, 'inside',  null,          'confirmed', null,                         null),
    ('Gal Hadad',       '050-000-0013', 3, time '20:45',  90, 'bar',     null,          'confirmed', null,                         null),
    ('Sarah Klein',     '050-000-0014', 6, time '21:00', 120, null,      'birthday',    'confirmed', '{"vip": true}'::jsonb,       'Regular guests'),
    ('Tom Weiss',       '050-000-0015', 2, time '21:15',  90, 'terrace', null,          'pending',   null,                         null),
    ('Dana Biton',      '050-000-0016', 4, time '21:30', 120, null,      null,          'confirmed', null,                         null),
    ('Nir Azulay',      '050-000-0017', 2, time '22:00',  90, 'bar',     null,          'confirmed', null,                         'Late arrival possible')
  ) as r(guest_name, phone, party_size, at_time, duration, zone_hint, occasion, status, prefs, notes);

  insert into demo_config (template_restaurant_id, template_day)
  values (v_rid, v_day)
  on conflict (id) do update
    set template_restaurant_id = excluded.template_restaurant_id,
        template_day = excluded.template_day;

  raise notice 'Added 17 reservations to % (%), registered as the demo template for %', v_restaurant_name, v_rid, v_day;
end;
$$;
