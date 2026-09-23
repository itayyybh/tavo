# Instrumented shifts

Phase 1 measured the seating scorer at 92% top-1 and then found that the number
described only part of the picture: the decision log records the pre-service
assignment session and almost nothing of the service itself.

The first reading of that was wrong. It looked like the app being abandoned
under pressure; it is actually the app being used exactly as designed, for a
job that finishes before service starts. What goes unrecorded is not the
engine's work but what happens to its plan afterwards.

This experiment collects that.

## What is being measured

Tavo is not run every day. It is run for Friday evening and Saturday morning,
the services with enough table reservations to be worth planning, and the
engine is used in one pre-service session: reservations are sorted onto tables
at around 16:00, then parties are seated as they arrive.

That workflow decides what can and cannot be measured. 65% of logged decisions
fall on a Friday or Saturday, and on those days there is exactly one decision
after 18:00 — not because the app is abandoned, but because the engine has
already done its job by then. Seating a party that is already assigned does not
run it again.

**Primary — plan survival.** Of the reservations assigned in the pre-service
session, how many are marked seated and later cleared during service. This is
the step that currently goes unrecorded: 16 reservations in the Phase 1 window
were assigned and accepted, then never marked as seated. `seated_at` and
`cleared_at` (migration 0023) are what capture it.

**Secondary — recorded share.** Parties seated according to the till, against
parties recorded in Tavo for the same service. Walk-ins and anything seated
without the app are invisible to every internal query, so this number cannot be
derived from the database.

**Tertiary — abandonment rate.** Suggestion runs where the host took nothing,
recorded since decisions began persisting on suggestion (2026-09-23).

**Qualitative — the drop-off point.** The clock time of the last app
interaction, against the time service actually ended.

Evening decision counts are deliberately NOT a metric. On a Friday they are
near zero when everything is working correctly.

## Rules

**Nominate shifts in advance.** Write the date into `shifts.csv` with
`nominated=yes` before the shift happens. Deciding afterwards which shifts
counted is what makes self-collected data worthless, and the temptation will be
strongest after a bad night.

**Log every nominated shift, including the failures.** A shift where the app was
abandoned at 20:30 is the most informative row in the file: it marks where
interaction cost exceeds what service allows. Set `ran_it=no`, fill in
`stopped_because`, and keep the row.

**The nomination list also separates test activity.** Phase 1 found 16 rows of
click-through activity in production data, identified afterwards from timestamp
clustering. Anything outside a nominated shift is now untrusted by default, so
no code flag is needed for this experiment.

**Get the till number the same night.** Retrieving it a week later will not
happen, and without it the experiment loses its denominator.

## The log

One row per shift in `shifts.csv`, filled in after service. Six fields, about a
minute.

| Field | Meaning |
| --- | --- |
| `date` | YYYY-MM-DD |
| `nominated` | yes/no — was this planned in advance |
| `ran_it` | yes/no/partial — did the app get used through service |
| `pos_parties` | parties seated that evening, from the till |
| `pos_covers` | diners that evening, from the till |
| `last_app_use` | HH:MM of the last interaction, blank if unknown |
| `stopped_because` | one short line, when it stopped early |
| `notes` | staffing, event, anything unusual |

## Predictions

Written 2026-09-23, before the first nominated shift. Predictions recorded
afterwards are not predictions, and the point of writing them down is that the
result can disagree.

| Prediction | Value |
| --- | --- |
| Parties on a typical Friday | ~16 |
| Covers on a typical Friday | ~106 |
| Share recorded on a nominated shift | 90-100% |
| Clock time the app is abandoned, if it is | 20:00-21:00, after the first two rounds |
| First nominated shift | week of 2026-09-28 (this Friday is a holiday, venue closed) |

The party and cover figures are the most recent Friday in the Phase 1 window
(2026-09-04: 16 decisions, all accepted, 106 covers implied), taken as the
Friday average. Fridays are reported to carry roughly the same volume.

The abandonment prediction is the interesting one. If the app is genuinely
abandoned after two rounds, the reservations seated late in service will be
systematically missing their `seated_at` — and that is a measurable, falsifiable
claim rather than an impression.

## What the result decides

If nominated shifts produce evening data at a rate comparable to the afternoon,
the blind spot was attention and staffing. The ranking evaluation can then be
re-run on data that covers the hard cases, and the Phase 1 numbers can be
checked against them.

If the app is still abandoned when the room fills — deliberately instrumented
and still abandoned — then interaction cost is confirmed as the binding
constraint, the seating scorer is not the thing to work on, and the product
question moves to the turnover flow.

Both outcomes are worth the weeks. The current state, where the number looks
good and describes the wrong half of the day, is the only one with no value.
