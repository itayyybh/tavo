-- ---------------------------------------------------------------------------
-- Seating decision outcome timestamps
--
-- `actual_minutes` (0014) stored a DERIVED number: clear-time minus seat-time,
-- computed in the client. Measuring it against real data showed the derivation
-- silently conflates three different things, and because only the result was
-- stored none of them can be told apart after the fact:
--
--   * Late clears  — the host clears at the next shift, not when the party
--     leaves. Implied clear times clustered at 11:00-12:00; 35 of 64 rows were
--     cleared on a LATER DAY than the seating (median 1191 minutes).
--   * Instant clears — 16 rows under 5 minutes, arriving in tight bursts
--     (eight within 45 minutes on 2026-08-08), i.e. someone clicking through
--     the app rather than a party that left.
--   * Real outcomes — only ~11 of 64 rows fell in a plausible 30-240 minutes.
--
-- So store the FACTS and derive the number. A validity rule that lives in a
-- view can be changed later without losing data; a stored duration cannot.
-- `actual_minutes` is kept, unwritten, so existing rows stay readable.
-- ---------------------------------------------------------------------------
alter table seating_decisions
  add column if not exists seated_at  timestamptz,
  add column if not exists cleared_at timestamptz;

comment on column seating_decisions.actual_minutes is
  'Deprecated (0023): derived duration written by clients before 2026-09. '
  'Unreliable — see the migration notes. Use seating_decision_outcomes instead.';

-- Derived outcome + why a row is or is not usable as ground truth. Edit the
-- bounds here when the evidence changes; the underlying facts stay intact.
create or replace view seating_decision_outcomes as
select
  d.*,
  extract(epoch from (d.cleared_at - d.seated_at)) / 60 as duration_min,
  case
    when d.seated_at is null or d.cleared_at is null then 'missing'
    when d.cleared_at < d.seated_at                  then 'negative'
    when d.cleared_at - d.seated_at < interval '15 min'  then 'too_short'
    when d.cleared_at - d.seated_at > interval '6 hours' then 'too_long'
    else 'ok'
  end as outcome_status
from seating_decisions d;
