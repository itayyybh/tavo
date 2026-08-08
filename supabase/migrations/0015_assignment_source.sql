-- ---------------------------------------------------------------------------
-- Reservation assignment source (Real-service reliability — manual vs auto)
--
-- Records who chose a reservation's `assigned_table_ids`:
--   'manual' — the host explicitly picked or dragged the table. PINNED: neither
--              auto-assign nor the repack optimizer may relocate it.
--   'auto'   — the Seating Engine chose it. May be reshuffled by a repack.
--
-- Nullable: pre-migration rows and unassigned reservations carry NULL, which the
-- app treats as `manual` — the safe default that is never silently moved.
-- ---------------------------------------------------------------------------
alter table reservations
  add column if not exists assignment_source text
  check (assignment_source in ('manual', 'auto'));
