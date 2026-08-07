-- ---------------------------------------------------------------------------
-- Seating decision log (Phase 11 — AI preparation)
--
-- The engine's decision log was in-memory only (decisionLogStore); a refresh
-- lost it. Persisting it turns every seating into durable decision history:
-- the options the engine ranked, which one the host accepted, and whether the
-- host overrode the engine's top pick. This is the training-data / audit spine
-- a future model-based scorer learns from — no live model yet.
--
-- `reservation_id` is `on delete set null` (not cascade): a Clear All or a
-- deleted booking must NOT erase the decision record — the labelled outcome is
-- worth keeping even after the reservation is gone.
-- ---------------------------------------------------------------------------
create table seating_decisions (
  id             text primary key,
  restaurant_id  text not null references restaurants (id) on delete cascade,
  reservation_id text references reservations (id) on delete set null,
  ts             timestamptz not null default now(),
  party_size     integer not null,
  -- Options the engine ranked, best first: [{ kind, tableIds, score }, ...].
  ranked         jsonb not null,
  -- Table ids the host accepted (null = suggested but never accepted).
  chosen         text[],
  -- True when `chosen` was NOT the engine's top-ranked option — the free label
  -- marking where the host disagreed with the engine.
  overridden     boolean not null default false,
  created_at     timestamptz not null default now()
);
create index seating_decisions_restaurant_idx
  on seating_decisions (restaurant_id, ts desc);

alter table seating_decisions enable row level security;

create policy seating_decisions_tenant on seating_decisions
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
