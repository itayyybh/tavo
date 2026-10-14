-- ---------------------------------------------------------------------------
-- Post-shift check. Run in the Supabase SQL editor, one block at a time.
--
-- Answers three questions, in order of how badly a "no" would hurt:
--   A. Did the Phase-1 fixes ever reach the database?
--   B. Did anything get logged at all since the last export (2026-09-19)?
--   C. Did decisions happen DURING service, or only in the pre-service sort?
--
-- C is the whole point of the instrumented shift. Last time there was exactly
-- ONE decision after 18:00 on a Friday or Saturday across the entire dataset.
-- ---------------------------------------------------------------------------

-- A. Schema check — are migrations 0023 / 0024 actually applied?
select
  count(*) filter (where column_name = 'seated_at')  as has_seated_at,
  count(*) filter (where column_name = 'cleared_at') as has_cleared_at,
  count(*) filter (where column_name = 'actual_minutes') as still_has_actual_minutes
from information_schema.columns
where table_name = 'seating_decisions';


-- B. Everything logged since the last export, by day.
select
  (ts at time zone 'Asia/Jerusalem')::date            as day,
  to_char(ts at time zone 'Asia/Jerusalem', 'Dy')     as weekday,
  count(*)                                            as decisions,
  count(*) filter (where chosen is not null)          as accepted,
  min(to_char(ts at time zone 'Asia/Jerusalem','HH24:MI')) as first_at,
  max(to_char(ts at time zone 'Asia/Jerusalem','HH24:MI')) as last_at
from seating_decisions
where ts >= '2026-09-20'
group by 1, 2
order by 1;


-- C. The during-service question. Buckets the day into pre-service sorting
-- vs actual service hours. If everything still lands before 18:00, the app
-- was used for planning again and the shift did not produce new evidence.
select
  (ts at time zone 'Asia/Jerusalem')::date        as day,
  case
    when (ts at time zone 'Asia/Jerusalem')::time <  time '17:00' then '1. pre-service (<17:00)'
    when (ts at time zone 'Asia/Jerusalem')::time <  time '19:00' then '2. early service (17-19)'
    when (ts at time zone 'Asia/Jerusalem')::time <  time '21:00' then '3. peak (19-21)'
    else                                                               '4. late (21:00+)'
  end                                             as window,
  count(*)                                        as decisions
from seating_decisions
where ts >= '2026-09-20'
group by 1, 2
order by 1, 2;


-- D. Outcome capture — only meaningful if A says the columns exist.
-- The old actual_minutes was unusable: 11 of 64 rows were plausible.
select
  count(*)                                               as rows_since_export,
  count(seated_at)                                       as have_seated_at,
  count(cleared_at)                                      as have_cleared_at,
  count(*) filter (
    where seated_at is not null and cleared_at is not null
      and cleared_at > seated_at
      and cleared_at - seated_at between interval '15 minutes' and interval '4 hours'
  )                                                      as plausible_durations
from seating_decisions
where ts >= '2026-09-20';
