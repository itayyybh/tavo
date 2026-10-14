-- ---------------------------------------------------------------------------
-- The decision log keeps its reservation id
--
-- `reservation_id` was a foreign key with `on delete set null`. Deleting a
-- reservation therefore kept the decision row but erased what it was about:
-- 127 of 181 rows had already lost their link, and with it any ability to group
-- a reservation's decisions, attribute them, or join them to party context.
-- The loss is not recoverable.
--
-- An append-only audit log should outlive its subject. The column keeps the
-- identifier as plain text, with no referential action attached to it. Rows
-- whose reservation is gone stay grouped and countable; the id simply no longer
-- resolves, which is a readable state rather than a destroyed one.
--
-- The index supports the outcome lookup, which filters by restaurant and
-- reservation and was previously served only by the (restaurant_id, ts) index.
-- ---------------------------------------------------------------------------
alter table seating_decisions
  drop constraint if exists seating_decisions_reservation_id_fkey;

create index if not exists seating_decisions_reservation_idx
  on seating_decisions (restaurant_id, reservation_id);

comment on column seating_decisions.reservation_id is
  'The reservation this decision was about. Deliberately not a foreign key: the '
  'log must keep its keys after a reservation is deleted. May not resolve.';
