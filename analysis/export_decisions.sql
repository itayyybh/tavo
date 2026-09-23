-- ---------------------------------------------------------------------------
-- Seating decision export for the Phase 1 evaluation baseline.
--
-- One row per logged decision, joined to the labels and reservation context a
-- human needs to judge whether the engine's ranking was right. Deliberately
-- excludes guest name, phone and email: the analysis never needs them.
--
-- Run in the Supabase SQL editor, then download as CSV to
-- analysis/data/decisions.csv (gitignored).
-- ---------------------------------------------------------------------------
with d as (
  select
    sd.id, sd.ts, sd.party_size, sd.overridden,
    sd.predicted_minutes, sd.actual_minutes,
    sd.reservation_id, sd.ranked, sd.chosen,
    jsonb_array_length(sd.ranked) as n_ranked,
    -- Position of the accepted set within the engine's ranking (1 = top).
    (select min(i)
       from jsonb_array_elements(sd.ranked) with ordinality as e(val, i)
      where (select array_agg(x order by x)
               from jsonb_array_elements_text(e.val -> 'tableIds') x)
          = (select array_agg(y order by y) from unnest(sd.chosen) y)
    )::int as chosen_rank
  from seating_decisions sd
),
lbl as (
  select t.id, t.label, z.name as zone_name,
         tt.solo_capacity, tt.connected_capacity
  from tables t
  left join zones z on z.id = t.zone_id
  left join table_types tt on tt.id = t.type_id
)
select
  d.id,
  (d.ts at time zone 'Asia/Jerusalem')::date          as day,
  to_char(d.ts at time zone 'Asia/Jerusalem', 'Dy')   as weekday,
  to_char(d.ts at time zone 'Asia/Jerusalem', 'HH24:MI') as clock,
  d.party_size,
  d.chosen_rank,
  d.n_ranked,
  -- False = the engine suggested and the host took nothing (only meaningful
  -- for rows written after decisions began persisting on suggestion).
  (d.chosen is not null) as accepted,
  d.overridden,
  d.predicted_minutes,
  d.actual_minutes,
  -- When the party was DUE, as distinct from when the engine was asked.
  -- Assignment happens in one pre-service session; service happens hours
  -- later, so the decision timestamp says nothing about the service curve.
  (r.date_time at time zone 'Asia/Jerusalem')                as due_at,
  to_char(r.date_time at time zone 'Asia/Jerusalem','HH24:MI') as due_clock,
  r.status = 'completed' or r.status = 'seated'              as reached_seated,
  r.estimated_duration,
  r.occasion,
  r.source,
  r.status,
  pz.name    as pref_zone,
  pt.label   as pref_table,
  r.preferences,
  r.notes,
  -- What the host accepted.
  (select string_agg(l.label, '+' order by l.label)
     from unnest(d.chosen) c join lbl l on l.id = c)   as chosen_labels,
  (select string_agg(distinct l.zone_name, '/')
     from unnest(d.chosen) c join lbl l on l.id = c)   as chosen_zone,
  coalesce(array_length(d.chosen, 1), 0)              as chosen_n_tables,
  (d.ranked -> (d.chosen_rank - 1) ->> 'kind')        as chosen_kind,
  (d.ranked -> (d.chosen_rank - 1) ->> 'score')::numeric as chosen_score,
  -- What the engine put first.
  (select string_agg(l.label, '+' order by l.label)
     from jsonb_array_elements_text(d.ranked -> 0 -> 'tableIds') x
     join lbl l on l.id = x)                          as top_labels,
  (select string_agg(distinct l.zone_name, '/')
     from jsonb_array_elements_text(d.ranked -> 0 -> 'tableIds') x
     join lbl l on l.id = x)                          as top_zone,
  (d.ranked -> 0 ->> 'kind')                          as top_kind,
  (d.ranked -> 0 ->> 'score')::numeric                as top_score,
  -- How close the call was.
  (d.ranked -> 0 ->> 'score')::numeric
    - (d.ranked -> (d.chosen_rank - 1) ->> 'score')::numeric as score_gap
from d
left join reservations r on r.id = d.reservation_id
left join zones pz       on pz.id = r.preferred_zone_id
left join lbl   pt       on pt.id = r.preferred_table_id
order by d.chosen_rank desc nulls first, d.ts;
