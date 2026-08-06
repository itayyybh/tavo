-- Phase 11 — Settings shell: per-zone availability. A zone can be taken out of
-- reservation/seating rotation without deleting it. Nullable (existing zones stay
-- bookable = treated as true by the app).
--
-- The transactional layout save (`replace_layout`, 0004) has a fixed zone column
-- list, so it must be recreated to carry the new field through.

alter table zones add column if not exists bookable boolean;

create or replace function public.replace_layout(
  p_restaurant_id text,
  p_table_types jsonb default '[]'::jsonb,
  p_zones jsonb default '[]'::jsonb,
  p_tables jsonb default '[]'::jsonb,
  p_connections jsonb default '[]'::jsonb,
  p_obstacles jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'not a member of this restaurant';
  end if;

  delete from tables            where restaurant_id = p_restaurant_id;
  delete from table_connections where restaurant_id = p_restaurant_id;
  delete from obstacles         where restaurant_id = p_restaurant_id;
  delete from zones             where restaurant_id = p_restaurant_id;
  delete from table_types       where restaurant_id = p_restaurant_id;

  insert into table_types (id, restaurant_id, name, shape, default_size, clearance, solo_capacity, connected_capacity)
  select x.id, p_restaurant_id, x.name, x.shape, x.default_size, x.clearance, x.solo_capacity, x.connected_capacity
  from jsonb_to_recordset(p_table_types) as x(
    id text, name text, shape text, default_size jsonb,
    clearance numeric, solo_capacity integer, connected_capacity integer
  );

  insert into zones (id, restaurant_id, name, color, position, size, parent_id, smoking, allow_table_relocation, bookable)
  select x.id, p_restaurant_id, x.name, x.color, x.position, x.size, x.parent_id, x.smoking, x.allow_table_relocation, x.bookable
  from jsonb_to_recordset(p_zones) as x(
    id text, name text, color text, position jsonb, size jsonb,
    parent_id text, smoking text, allow_table_relocation boolean, bookable boolean
  );

  insert into tables (id, restaurant_id, zone_id, type_id, label, position, size, rotation, status, merged_group_id, zone_pinned)
  select x.id, p_restaurant_id, coalesce(x.zone_id, ''), x.type_id, x.label, x.position, x.size,
         coalesce(x.rotation, 0), coalesce(x.status, 'available'), x.merged_group_id, x.zone_pinned
  from jsonb_to_recordset(p_tables) as x(
    id text, zone_id text, type_id text, label text, position jsonb, size jsonb,
    rotation numeric, status text, merged_group_id text, zone_pinned boolean
  );

  insert into table_connections (id, restaurant_id, table_ids, seats, clearance)
  select x.id, p_restaurant_id, x.table_ids, x.seats, x.clearance
  from jsonb_to_recordset(p_connections) as x(
    id text, table_ids text[], seats integer, clearance numeric
  );

  insert into obstacles (id, restaurant_id, kind, label, position, size, rotation, points, brush_width)
  select x.id, p_restaurant_id, x.kind, x.label, x.position, x.size, coalesce(x.rotation, 0), x.points, x.brush_width
  from jsonb_to_recordset(p_obstacles) as x(
    id text, kind text, label text, position jsonb, size jsonb,
    rotation numeric, points jsonb, brush_width numeric
  );
end;
$$;
