-- Fake reservations for the demo TEMPLATE restaurant, and its demo_config row.
-- Run in the Supabase SQL editor AFTER building the template's layout.
-- Safe to re-run: it replaces the template's reservations each time.
-- Plain SQL (no DO block), because the dashboard editor can mangle $$ blocks.
--
-- Everything here is invented: names, phones (050-000-00xx) and notes.
-- To change the restaurant name or the evening, edit the `settings` line in
-- BOTH statements.

-- 1) Replace the template's reservations with 17 fake ones.
with settings as (
  select 'Demo Bistro'::text as restaurant_name, date '2026-11-05' as day
),
template as (
  select r.id, coalesce(r.timezone, 'Asia/Jerusalem') as tz, s.day
    from restaurants r, settings s
   where r.name = s.restaurant_name
     and not r.is_demo
     -- refuse if the name is ambiguous: never touch the wrong restaurant
     and (select count(*) from restaurants x
           where x.name = s.restaurant_name and not x.is_demo) = 1
),
cleared as (
  delete from reservations
   where restaurant_id = (select id from template)
)
insert into reservations (
  id, restaurant_id, guest_name, phone, party_size, date_time, estimated_duration,
  preferred_zone_id, occasion, status, source, preferences, notes
)
select
  gen_random_uuid()::text,
  t.id,
  v.guest_name,
  v.phone,
  v.party_size,
  (t.day + v.at_time) at time zone t.tz,
  v.duration,
  (select z.id from zones z
    where z.restaurant_id = t.id
      and v.zone_hint is not null
      and z.name ilike '%' || v.zone_hint || '%'
    limit 1),
  v.occasion,
  v.status,
  'manual',
  v.prefs::jsonb,
  v.notes
from template t
cross join (values
  ('Noa Levi',      '050-000-0001', 2, time '18:00',  90, 'terrace', null,          'confirmed', '{"windowSeat": true}', null),
  ('Daniel Cohen',  '050-000-0002', 4, time '18:15', 120, null,      'business',    'confirmed', null,                   'Needs a quiet table'),
  ('Maya Friedman', '050-000-0003', 2, time '18:30',  90, 'bar',     'date',        'confirmed', null,                   null),
  ('Yossi Mizrahi', '050-000-0004', 6, time '18:45', 120, 'inside',  'birthday',    'confirmed', '{"highChair": true}',  'Birthday cake at 20:00, one high chair'),
  ('Tamar Shapiro', '050-000-0005', 3, time '19:00',  90, null,      null,          'pending',   null,                   null),
  ('Ori Ben-David', '050-000-0006', 2, time '19:00',  90, 'terrace', 'anniversary', 'confirmed', null,                   'Anniversary, a nice corner if possible'),
  ('Liat Avraham',  '050-000-0007', 8, time '19:15', 150, 'inside',  'celebration', 'confirmed', null,                   'Team dinner, will need joined tables'),
  ('Alex Rivera',   '050-000-0008', 2, time '19:30',  90, 'bar',     null,          'confirmed', null,                   null),
  ('Shira Katz',    '050-000-0009', 4, time '19:45', 120, null,      null,          'confirmed', '{"wheelchair": true}', 'Wheelchair access needed'),
  ('Amit Goldberg', '050-000-0010', 5, time '20:00', 120, 'terrace', null,          'pending',   null,                   null),
  ('Rina Peretz',   '050-000-0011', 2, time '20:15',  90, null,      'date',        'confirmed', '{"allergies": "nuts"}', 'Nut allergy'),
  ('Eitan Rosen',   '050-000-0012', 4, time '20:30', 120, 'inside',  null,          'confirmed', null,                   null),
  ('Gal Hadad',     '050-000-0013', 3, time '20:45',  90, 'bar',     null,          'confirmed', null,                   null),
  ('Sarah Klein',   '050-000-0014', 6, time '21:00', 120, null,      'birthday',    'confirmed', '{"vip": true}',        'Regular guests'),
  ('Tom Weiss',     '050-000-0015', 2, time '21:15',  90, 'terrace', null,          'pending',   null,                   null),
  ('Dana Biton',    '050-000-0016', 4, time '21:30', 120, null,      null,          'confirmed', null,                   null),
  ('Nir Azulay',    '050-000-0017', 2, time '22:00',  90, 'bar',     null,          'confirmed', null,                   'Late arrival possible')
) as v(guest_name, phone, party_size, at_time, duration, zone_hint, occasion, status, prefs, notes);

-- 2) Register the restaurant as the demo template.
with settings as (
  select 'Demo Bistro'::text as restaurant_name, date '2026-11-05' as day
)
insert into demo_config (template_restaurant_id, template_day)
select r.id, s.day
  from restaurants r, settings s
 where r.name = s.restaurant_name
   and not r.is_demo
   and (select count(*) from restaurants x
         where x.name = s.restaurant_name and not x.is_demo) = 1
on conflict (id) do update
  set template_restaurant_id = excluded.template_restaurant_id,
      template_day = excluded.template_day;

-- 3) Check: should show 17 and the template row.
select
  (select count(*) from reservations r join demo_config d on d.template_restaurant_id = r.restaurant_id) as template_reservations,
  (select template_restaurant_id from demo_config) as template_id,
  (select template_day from demo_config) as template_day;
