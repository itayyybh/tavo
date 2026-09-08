-- Live Floor urgency ramp thresholds — one jsonb column on the per-restaurant
-- settings row (member-scoped RLS + whole-row upsert already apply — no new
-- policy or RPC). Minutes-until-arrival at which a reserved table escalates its
-- color: soon (first tint) -> due -> imminent. Shape + default mirror
-- DEFAULT_URGENCY_THRESHOLDS in the app so existing rows keep today's behaviour.
--
-- { soon, due, imminent } — strictly descending. Past arrival (unseated) is
-- always "overdue", independent of these. Display-only; never gates seating.

alter table restaurant_settings
  add column if not exists urgency_thresholds jsonb not null default '{
    "soon": 30,
    "due": 15,
    "imminent": 5
  }'::jsonb;
