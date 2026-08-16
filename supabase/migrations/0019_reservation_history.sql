-- ---------------------------------------------------------------------------
-- Reservation history / archive (End-of-day reset + accidental-delete recovery)
--
-- A reservation is never hard-deleted by the host anymore. Instead it is
-- ARCHIVED — moved to History — from where it can be restored, or permanently
-- removed. Two paths set `archived`:
--   'deleted'     — the host deleted it (recoverable, unlike the old hard delete)
--   'end_of_day'  — the automatic end-of-service sweep, once every booking for
--                   the day is terminal and the last one's window has passed.
--
-- History is a flag on the existing table (not a separate table): active views
-- filter `archived = false`; the History surface reads `archived = true`. Keeps
-- one source of truth, RLS unchanged, and restore is a single UPDATE.
--
-- Existing rows default to not-archived, so current behaviour is preserved.
-- ---------------------------------------------------------------------------
alter table reservations
  add column if not exists archived boolean not null default false;

alter table reservations
  add column if not exists archived_at timestamptz;

alter table reservations
  add column if not exists archive_reason text
  check (archive_reason in ('deleted', 'end_of_day'));

-- The active list and the History list both filter by this flag per tenant.
create index if not exists reservations_restaurant_archived_idx
  on reservations (restaurant_id, archived);
