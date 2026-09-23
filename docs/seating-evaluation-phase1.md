# Seating Engine Evaluation — Phase 1

An evaluation of Tavo's rules-based seating scorer, run to decide whether to
replace it with an LLM. The answer was no — and the reason changed twice during
the investigation.

## Summary

The rules-based scorer ranks the eventual choice first 81.7% of the time, and
92% once scoring ties are set aside. It never once failed to offer the option
the host took. On that evidence alone, replacing it with an LLM would buy at
most 14 decisions out of 175.

The investigation did not stop there, and the more useful findings came after.

- **The outcome field was unusable.** Of 64 recorded durations, 11 were
  plausible. The rest measured time-until-cleared-in-the-UI, not time at the
  table.
- **The log covers assignment, not service.** The engine runs once per service,
  in a pre-service session at around 16:00; seating a party it already assigned
  does not run it again. On Fridays, the service Tavo is actually used for,
  there is exactly one decision after 18:00. What happens to the plan during
  service is therefore unrecorded — 16 reservations were assigned, accepted, and
  never marked seated.
- **The sample is smaller and more correlated than it appears.** 181 decisions
  map to 33 distinct reservations among the rows that still resolve; 127 rows
  lost their reservation link entirely to a foreign key set to null on delete.
- **Two of the three patterns found in the failures did not survive base-rate
  checking.** Only the tie-break did.

So the 92% describes a host at a screen with the whole evening laid out, hours
before anybody sits down. It is not evidence that the scorer seats well. It is
evidence that it agrees with a plan.

No LLM scorer was built. The data cannot support the comparison, and the
constraint that matters is not ranking quality.

## The question, and choosing a metric

Tavo's seating engine generates feasible table candidates, filters them through
hard constraints, then ranks them with a weighted rule-based scorer behind a
pluggable `SeatingScorer` interface. That interface exists so the ranking can be
swapped for a model. The question was whether it should be.

Every accepted suggestion is written to a `seating_decisions` table: the full
ranked list the engine offered, the set the host accepted, party size, a
timestamp, and an `overridden` boolean.

**The obvious metric is the wrong one.** `overridden` is set when the accepted
set differs from `ranked[0]`, so it collapses two failures that are not alike:

- the host took the engine's second choice — a near miss in ordering
- the host took something the engine never offered — a miss in candidate
  generation

The first is a scorer problem. The second is not, and no better scorer fixes it.

Because `ranked` stores the whole ordered list, the **rank position of the
accepted set** is recoverable, which turns this into an ordinary ranking
evaluation with established metrics: top-k accuracy, mean reciprocal rank, and a
separate bucket for "not offered at all".

```sql
(select min(i)
   from jsonb_array_elements(sd.ranked) with ordinality as e(val, i)
  where (select array_agg(x order by x)
           from jsonb_array_elements_text(e.val -> 'tableIds') x)
      = (select array_agg(y order by y) from unnest(sd.chosen) y)
)::int as chosen_rank
```

### The caveat that governs everything below

This measures **agreement with the host**, not seating quality. A host who
clicks the first option from habit is indistinguishable from one who clicks it
because it was correct. A high top-1 score is therefore ambiguous evidence, and
an unusually high one is a reason for suspicion rather than celebration.

Separating the two requires an outcome signal that does not pass through host
judgement. The schema appears to have one — `predicted_minutes` against
`actual_minutes` — and a later section explains why it does not work.

## Baseline

181 logged decisions from 2026-08-07 to 2026-09-04, across 12 active days at one
venue. 175 had a non-empty ranked list; the other 6 came from the repack path,
which records an empty list by design.

| Metric | Value |
| --- | --- |
| top-1 accuracy | 81.7% (143/175) |
| top-3 accuracy | 96.0% (168/175) |
| top-5 accuracy | 100% (175/175) |
| MRR | 0.889 |
| Accepted set absent from the ranked list | 0 |

### Rank distribution

| Rank of accepted option | Decisions |
| --- | --- |
| 1 | 143 |
| 2 | 15 |
| 3 | 10 |
| 4 | 6 |
| 5 | 1 |

**Zero recall misses is the most informative number here.** Candidate generation
and the feasibility filter always produced the option the host wanted. Whatever
is imperfect about this engine, it is ordering, not retrieval — which rules out
the whole class of fixes aimed at generating better candidates.

The counts are internally consistent: 32 decisions ranked 2 or worse, plus 6
repack rows flagged as overrides, equals the 38 rows where `overridden` is true.

## Not all disagreements are errors

The scorer records its own score for every option, so for each disagreement we
can ask how strongly the engine actually preferred its own pick. Splitting the
32 by that gap changes the picture.

| Score gap | Decisions | What it means |
| --- | --- | --- |
| Exactly 0 | 14 | The engine rated both options identically |
| Under 0.5 | 4 | Effectively identical |
| 0.5 to 2 | 0 | — |
| Over 2 | 14 | The engine genuinely preferred something else |

**Eighteen of the 32 are ties.** The scorer expressed no preference; the order
came from candidate generation, not from scoring. Counting those as ranking
errors blames the scorer for a decision it did not make. Excluding them, the
genuine error rate is 14 of 175, and top-1 rises to **92%**.

### The three patterns behind the remainder

**Unbroken ties (18).** Almost all share a shape: a small party, two single
tables in the same zone with identical capacity, no preferred table, identical
score. Hosts show consistent preferences among these equivalent options — table
6 over 12 and over 15, table 21 over 128 — but the engine has no field that can
express such a preference. This is a tie-break or a host-configurable table
priority, not a modelling problem.

**Capacity fit and tight fits — a pattern that did not survive checking.**
Scoring is `capacityFit / (1 + waste)`, so an exact fit scores 10, one spare
seat 5, two spare seats 3.33. Three times, for a party of five, the engine
proposed an exact-fit table and the host took one with two spare seats. That
looked like hosts preferring slack.

Base rates say otherwise. Decoding waste from the logged scores across every
top-ranked single: exact fits were accepted 24 of 36 times (67%), one spare seat
17 of 23 (74%), two spare seats 2 of 3 (67%). The direction is there, but the
gap is seven points and the two-spare-seat bucket returns to 67%, which breaks
the monotonic story. Three examples out of thirty-six opportunities is not a
pattern.

**Table 2 and the toilets — a pattern that did not survive checking either.**
Table 2 appeared in five rejected top-ranked merges, and the operator supplied a
physical explanation: it sits beside the toilets, so a merge reaching it seats
diners next to them.

The explanation is true and the pattern is not. Merges containing table 2 were
ranked first 20 times and accepted 15 of them — 75%, against an overall base
rate of 81.7%, with n=20. Hosts merge through table 2 routinely, presumably
because parties of seven to twelve leave no alternative. Encoding a negative
weight would fight fifteen sound decisions in order to repair five.

### What survives, and the error that removed the rest

Only the tie-break. It survives because it is not an inference about host
behaviour but a fact about the scorer: in 18 of 32 disagreements it assigned
identical scores. No base rate can refute that.

The other two came from reading the failure set without asking how often the
same configuration appeared among the successes. Five rejected merges look like
a rule until the fifteen accepted ones are counted. This is the same error that
makes `overridden` the wrong metric, committed one level up, and it is recorded
here rather than quietly deleted: failures are where patterns appear, and base
rates are what decide whether they are real.

The surviving pattern now has a coherent explanation. Of the 14 exact ties, 12
were single against single. Merges are accepted at a far higher rate than
singles, because a merge has few feasible alternatives and the choice is nearly
forced, while a single has many equivalent ones the scorer cannot separate.
There is one structural problem here, not three, and it is not a tuning problem:
no field in the configuration can express the preference hosts demonstrably
have.

## The outcome data does not work

The schema promises ground truth: `predicted_minutes` snapshotted at accept
time, `actual_minutes` stamped when the party is cleared. Together they would
let us ask whether top-ranked choices actually turned out better — the one
question that separates agreement from quality.

They do not survive inspection.

| Check | Result |
| --- | --- |
| Rows with an outcome | 64 of 181 |
| Plausible for a restaurant (30–240 min) | **11** |
| Under 5 minutes | 16 |
| Over 6 hours | 35 |
| Median | 1,191 minutes (19.9 hours) |
| `predicted_minutes` equal to 120 | 87% |

`predicted_minutes` is a constant default, so predicted-versus-actual was never
a prediction to begin with.

### Finding the cause by prediction rather than by reading code

The hypothesis was that hosts clear tables late. Rather than inspect the handler
and reason forward, it is cheaper to ask what else must be true if the
hypothesis holds, and test that instead. If clears happen late, implied clear
times — `ts + actual_minutes` — should cluster at particular hours rather than
scatter.

They cluster hard. **33 of 64 implied clears land between 11:00 and 12:00**, and
35 were on a later calendar day than the seating. Tables are being cleared the
next morning, when somebody opens the app.

The same view exposed a second population the hypothesis had not predicted.
Same-day clears have a median of **2 minutes**, and 16 are under five. Their
timestamps give them away:

```
2026-08-08  12:39, 12:40, 12:40, 12:40, 13:03, 13:14, 13:20, 13:21
2026-08-10  11:33, 11:33, 11:34, 11:38, 11:40
```

Eight clears in 45 minutes, then five in seven minutes, all in the first week
after the feature shipped. That is somebody clicking through the application,
not parties leaving. Test activity had reached production data.

### The design error underneath

The client computed `Date.now() - seatedAt` and stored the result. Storing the
derived number instead of the facts it derives from meant that three different
situations — a real seating, a late clear, and a test click — became
indistinguishable the moment they were written.

The fix is to store `seated_at` and `cleared_at` and derive validity in a view,
so the rule can be revised as evidence accumulates without re-collecting
anything.

## When the app is actually open

Half the decisions arrive less than sixty seconds after the previous one, which
raised the possibility that bulk operations were inflating the accuracy figure.
Splitting by that gap shows they were not:

| Subset | n | top-1 | top-1 excluding ties |
| --- | --- | --- | --- |
| Within 60s of the previous decision | 86 | 81.4% | 94.2% |
| At least 60s after | 89 | 82.0% | 89.9% |

Nearly identical, so the baseline survives that particular objection. Deliberate
decisions are marginally harder, which is what you would expect: a host who
pauses to think disagrees more often.

**The hour-of-day distribution is a different matter.**

| Hour | Decisions |
| --- | --- |
| 07:00 | 8 |
| 11:00 | 13 |
| 12:00 | 7 |
| 13:00 | 18 |
| 14:00 | 26 |
| 15:00 | 8 |
| 16:00 | **43** |
| 17:00 | 23 |
| 18:00 | 4 |
| 19:00 | 16 |
| 20:00 | 10 |
| 21:00 | 3 |
| 22:00 | 2 |

Evening service, 19:00 to 23:00, accounts for **31 of 181 decisions — 17%** —
and 28 of those 31 come from just two days. **Eight of the twelve active days
contain no evening decisions at all.** Use peaks at 16:00, in the lull between
lunch and dinner.

Read alone, that looks like the app being abandoned under pressure. It is not,
and the weekday split shows why. 65% of decisions fall on a Friday or Saturday —
the services with enough reservations to be worth planning — and those days
carry a completely different profile from the rest:

| Hour | Fri/Sat | Other days |
| --- | --- | --- |
| 14:00 | 26 | — |
| 16:00 | **42** | 1 |
| 17:00 | 22 | 1 |
| 19:00 | **1** | 15 |
| 20:00 | — | 10 |
| 21:00–22:00 | — | 5 |

On the services Tavo is actually used for there is one decision after 18:00.
Every evening decision in the dataset comes from some other weekday, and those
are frequently the same Friday assignment work done a day or two early.

The workflow explains it. Reservations are sorted onto tables in one pre-service
session at around 16:00, then parties are seated as they arrive. The engine has
finished its job before service starts, and seating a party it already assigned
does not invoke it. An empty evening is what correct operation looks like.

### What this means for the baseline

The 92% still describes a narrow slice, but not the slice it first appeared to.
It measures the pre-service assignment session: a host at a screen with the
whole evening laid out, time to consider each booking, and a floor that is still
empty. Nothing in the dataset describes a decision taken under pressure, because
the engine is not consulted then.

What goes unmeasured is not the engine's ranking but what becomes of its plan.
Parties arrive late, tables turn differently than expected, walk-ins take space
the plan assumed was free — and none of that reaches the database. The engine
has not been shown to be 92% accurate at seating. It has been shown to agree
with a host 92% of the time about a plan, hours before anybody sits down.

## What 181 decisions actually are

The next question is how much independent evidence 181 rows represent.

| | |
| --- | --- |
| Total decisions | 181 |
| Rows whose reservation link is null | 127 |
| Distinct reservations among the rest | 33 |

The 54 rows that still resolve cover 33 reservations, about 1.6 decisions each.
Re-running suggestions for the same booking does not produce independent
observations: if the engine ranks table 7 first for one reservation three times
and the host takes it each time, that is one fact counted three times. Effective
sample size is materially below 175, and the observations are correlated in a
way the metrics above do not account for.

Reservations tell the same story from the other side. Since 2026-08-07, **40
reservations exist, all of them archived**:

| Status | Reservations | With a decision row |
| --- | --- | --- |
| completed | 20 | 18 |
| confirmed | 16 | 14 |
| pending | 3 | 0 |
| seated | 1 | 1 |

**The 16 confirmed reservations are the clearest evidence that the plan is where
the record stops.** The engine suggested, the host accepted a suggestion — a
decision row exists — and the reservation was never marked as seated.

### A measurement that cannot be taken from inside

An obvious next question is how many seatings never reached the database at all.
A join between reservations and decisions answers a narrower one: of seatings we
know about, 7% lack a decision row.

That number is reassuring and meaningless. Parties seated without the app are
frequently not reservations in the first place — walk-ins, or bookings never
marked seated. They are absent from both tables. **Missing data cannot be
measured from within the dataset that is missing it**, and any internal query
will keep returning comfortable answers for exactly that reason.

Establishing the real denominator requires an external source: covers or checks
from the point-of-sale system, compared against seatings recorded in Tavo for
the same evening.

### A data-loss bug worth naming

`seating_decisions.reservation_id` is a foreign key with `on delete set null`.
When a reservation is deleted, the decision survives but loses its identity,
which is why 127 rows can no longer be grouped, attributed or joined to context.
An append-only audit log should not lose its keys when its subject is removed.
The column should hold the identifier without the constraint, or keep a
denormalised copy alongside it. The 127 rows are not recoverable.

## Why no model was built

Three independent reasons, any one of which would be sufficient.

**There is almost nothing to win, and part of it contains no signal.** Fourteen
genuine ranking errors out of 175, with zero recall misses. The eighteen ties
are not errors the scorer can be blamed for — they are decisions where it
expressed no preference at all, which also means a model would have nothing to
learn from them. What remains is structural: the scorer cannot distinguish
equivalent single tables, and no configuration field can express the preference
hosts actually have. That is a schema gap, not a ranking-quality gap, and a
better ranker does not close it.

**Fourteen examples cannot tune anything, let alone train it.** Choosing a
weight that repairs the three party-of-five cases would fit a parameter to three
observations. Worse, it could quietly break some of the 143 the engine already
gets right. The correct sequence is to reimplement the scorer offline, verify it
reproduces all 175 logged scores exactly, and only then sweep parameters while
watching both what improves and what regresses. That harness does not exist yet,
and building the model before it would mean optimising a number nobody can
check.

**The measurement does not cover the problem.** Every decision in the dataset
was taken before service began. Whatever a new scorer achieved here would
describe the quality of a plan, not the quality of a seating, and the comparison
would not transfer to the hours that matter.

### The constraint that does matter

Ranking quality is not what limits this system. What limits it is that the plan
and reality diverge during service, and nothing records the divergence. A
better-ranked plan that nobody updates once guests arrive is worth very little.

That reframing also points at where a language model would genuinely help, which
is not scoring. The expensive part is telling the system what happened. Tavo
already has a WhatsApp integration; a short spoken or typed note — *"seven is
free, I sat Cohen on twelve"* — parsed into state changes fits the actual
constraint. Messy, fast, human input with no interface is what these models are
good at. Ranking five candidate tables against a weighted rubric is not.

## What this analysis got wrong, three times

Three patterns were found in the data, explained confidently, and then
overturned. Each was corrected by a single sentence from the person who works
the floor.

**Table 2.** Five rejected merges containing it looked like a rule, and the
operator supplied a physical reason — it sits beside the toilets — which made
the rule feel confirmed. Base rates then produced fifteen accepted merges
against those five, at a rate indistinguishable from the overall average. The
explanation was true. The rule was not.

**The capacity-fit curve.** Three cases where a host took a table with spare
seats over an exact fit looked like a scoring bug. Across all thirty-six
opportunities the effect was seven points and non-monotonic.

**The hour-of-day distribution.** Seventeen per cent of decisions in evening
service, and none at all on two-thirds of active days, read as the app being
abandoned under pressure. It is not. The engine is run once per service, in a
pre-service assignment session at around 16:00, and seating a party that is
already assigned does not run it again. On Fridays — the service Tavo is
actually used for — there is exactly one decision after 18:00, and that is what
correct operation looks like. Decisions on other weekdays are frequently the
same Friday assignment work done a day or two early, which the next export can
confirm by comparing when a decision was taken against when its reservation was
due.

The first two failures share a cause: reading the failure set without checking
how often the same configuration appears among the successes. Five rejections
look like a rule until the fifteen acceptances are counted.

The third is different, and more instructive. The data was accurate and the
pattern was real. The explanation was wrong anyway, because explaining it
required knowing how the venue runs a service — something no amount of the log
could supply. Coherent, confident and wrong is the default output of analysis
without domain knowledge, and it arrives at a high rate.

That bears directly on the decision not to replace the rule-based scorer. A
model trained on this log inherits the same handicap. It would learn that
certain merges are avoided without knowing that a table sits beside the toilets,
and that evenings are quiet without knowing the work was finished at four
o'clock.

## Limitations

**One venue, twelve active days, one operator.** Nothing here generalises to
other restaurants, and the operator who ran most of the logged shifts also
conducted this analysis.

**Agreement is not quality.** Every accuracy figure in this report measures
whether the host took the engine's top suggestion. Whether those seatings were
good for the restaurant is unknown, because the outcome field that would answer
it is broken.

**The sample is correlated.** Repeat suggestion runs for the same reservation
are counted as separate observations. No confidence intervals are quoted,
because with an unclear effective sample size they would imply more precision
than the data supports.

**Abandoned suggestion runs are invisible.** Decisions persisted only on
acceptance, so a run the host ignored left no row. Cases where the engine
offered nothing useful are structurally absent from this dataset.

**Test activity is present in production data** and was identified after the
fact from timestamp clustering, not from a flag. Some rows attributed to service
are almost certainly not service.

### An open hypothesis

The operator's reading is that Tavo is capable of being an operations system,
and that Cafe Jolie is simply an unrepresentative site: with no host or hostess,
waiters and the shift manager run the app, so it is used for planning rather
than operations.

This is plausible and comes from someone who works the floor. It is also
unfalsified rather than confirmed — inferred from one venue's usage, not from
another venue's success. A competing explanation fits the same data: that
interaction cost during service is too high for anyone, a dedicated host
included, since a host is also busy at peak.

The distinction is not academic. If the first reading is right, the product
needs venues with a host station. If the second is right, the flow itself needs
to change. Those are different roadmaps, and nothing currently in the data
separates them. Worth noting too: if the product requires a dedicated host, that
is a constraint on the addressable market, not a quirk of one customer —
mid-size venues frequently have no host station.

The cheap test is conversational, not technical. Ask several restaurants that do
have a host station whether the host updates a floor screen during peak service,
or works from memory and reconciles afterwards.

Either way, the conclusion for this evaluation is unchanged: the pilot site will
not produce service-grade data on its own, so the comparison cannot be run on
what exists today.

## Changes made

**Outcome recording now stores facts.** `seated_at` and `cleared_at` replace the
client-computed `actual_minutes`, which is retained, unwritten, and marked
deprecated so existing rows stay readable and clearly separated from new ones.
Validity moved into a view:

```sql
create or replace view seating_decision_outcomes as
select d.*,
  extract(epoch from (d.cleared_at - d.seated_at)) / 60 as duration_min,
  case
    when d.seated_at is null or d.cleared_at is null     then 'missing'
    when d.cleared_at < d.seated_at                      then 'negative'
    when d.cleared_at - d.seated_at < interval '15 min'  then 'too_short'
    when d.cleared_at - d.seated_at > interval '6 hours' then 'too_long'
    else 'ok'
  end as outcome_status
from seating_decisions d;
```

Those bounds are a judgement drawn from 64 samples and will change. Because the
underlying timestamps are preserved, revising them reclassifies the entire
history with a single statement. A stored duration would have required
collecting the data again.

**Decisions persist on suggestion, not only on acceptance.** A row is written
when the engine produces options and updated in place if an acceptance follows,
so `chosen is null` now means the engine offered and the host took nothing. The
acceptance write is an upsert rather than an update, because the insert is
fire-and-forget and may not have landed.

**The decision log keeps its keys.** The `on delete set null` foreign key was
dropped, so a deleted reservation no longer erases what a decision was about.

**A skip-cleaning setting.** Clearing a party can now return its tables straight
to available instead of routing them through the cleaning turnover state. The
implementation drops the runtime status override rather than writing
`available`, so a table blocked at design time stays blocked. It deliberately
did not reuse `turnoverBufferMin`: that value also spaces consecutive bookings
inside the seating engine, so zeroing it would have silently changed seating
behaviour — an overloaded setting that looks like the right knob and is not.

**An evaluation harness.** `analysis/export_decisions.sql` pulls decisions
joined to table labels, zones and reservation context, excluding guest name,
phone and email, which the analysis never needs. `analysis/baseline.py` computes
the ranking metrics, the failure taxonomy and the outcome-quality checks, and
separates decided rows from abandoned runs and repacks so they are never mixed.

## Next

The dataset cannot answer the question it was collected for. The next phase
collects one that can, by deliberately operating the app through service and
measuring what changes. The protocol, the shift log and the predictions —
written before the first instrumented shift — are in `analysis/experiment/`.

Its primary metric is plan survival: of the reservations assigned in the
pre-service session, how many are marked seated and later cleared during
service. Evening decision counts are deliberately not a metric, because on a
Friday they are near zero when everything is working correctly.

### Smaller items, in order

1. Reimplement the scorer offline and verify it reproduces all 175 logged scores
   before changing any weight.
2. Add a host-configurable table priority, so the preference that breaks ties
   can be stated rather than inferred.
3. Flag test activity at the source rather than reconstructing it later from
   timestamp clustering.
