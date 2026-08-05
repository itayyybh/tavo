-- Phase 9 — Live Floor sync. Store the whole runtime FloorSnapshot as one
-- per-restaurant row and stream it, so seating a party on one device (iPad)
-- shows on another (desktop) without a refresh. floor_state already holds the
-- override maps + runtime merges; add the seatings so the row is the complete
-- snapshot, and put the table on the realtime publication.

alter table floor_state
  add column if not exists seatings jsonb not null default '[]'::jsonb;

alter publication supabase_realtime add table floor_state;
