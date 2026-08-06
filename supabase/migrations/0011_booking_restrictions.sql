-- Phase 11 — Settings shell: booking restrictions (one-off blackout dates +
-- temporary closure). One jsonb column on the per-restaurant settings row
-- (member-scoped RLS + whole-row upsert already apply). Shape mirrors
-- DEFAULT_BOOKING_RESTRICTIONS in the app; default is nothing blocked, not closed.
--
-- { blocks: [{ id, date: "YYYY-MM-DD", from: "HH:mm"|null, to: "HH:mm"|null,
--   reason? }], closure: { active: bool, until: "YYYY-MM-DD"|null, reason? } }

alter table restaurant_settings
  add column if not exists booking_restrictions jsonb not null default '{
    "blocks": [],
    "closure": {"active": false, "until": null}
  }'::jsonb;
