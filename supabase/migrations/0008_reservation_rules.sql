-- Phase 11 — Settings shell: reservation & party rules. One jsonb column on the
-- per-restaurant settings row (member-scoped RLS + whole-row upsert already
-- apply — no new policy or RPC). Shape and default mirror
-- DEFAULT_RESERVATION_RULES in the app so existing rows start permissive.
--
-- { latestBookingTime: "HH:mm"|null, minAdvanceMinutes, allowSameDay,
--   allowAfterClosing, minPartySize, maxPartySize, allowSplitParty,
--   allowAltZoneSuggestions }. "Max combined tables" is NOT here — it lives in
-- the seating config (merge.maxMergeSize), surfaced read/write in the UI.

alter table restaurant_settings
  add column if not exists reservation_rules jsonb not null default '{
    "latestBookingTime": null,
    "minAdvanceMinutes": 30,
    "allowSameDay": true,
    "allowAfterClosing": false,
    "minPartySize": 1,
    "maxPartySize": 20,
    "allowSplitParty": false,
    "allowAltZoneSuggestions": true
  }'::jsonb;
