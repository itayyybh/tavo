-- ---------------------------------------------------------------------------
-- Seating decision outcomes (Phase 11 — AI preparation, P3)
--
-- Grade each persisted decision against reality. `predicted_minutes` is the
-- engine's expected stay (the reservation's estimated duration), snapshotted at
-- accept time so it survives the booking being edited or deleted.
-- `actual_minutes` is the real seated duration, stamped when the party is
-- cleared from the floor (the `completed` transition).
--
-- Both nullable: a party that is never cleared (shift closed, no-show after
-- seating) simply leaves `actual_minutes` null. Together, predicted vs actual is
-- the ground-truth label a future model-based scorer trains on.
-- ---------------------------------------------------------------------------
alter table seating_decisions
  add column if not exists predicted_minutes integer,
  add column if not exists actual_minutes integer;
