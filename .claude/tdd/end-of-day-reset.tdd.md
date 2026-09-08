# TDD Evidence — End-of-day table reset & history sweep

**Source plan**: none — journey derived during this TDD run from the reported bug.
**Runner**: vitest (`npx vitest run`).
**Branch**: `feat/floor-plan-mode`.

## User journey

> As a host, when the working day ends (midnight rolls over), I want all tables
> reset and the day's reservations moved to History — even ones a colleague left
> marked seated — so the floor opens clean for the next service without a table
> staying stuck as "occupied".

## Bug

`endOfDayArchivableIds` had a single guard — `if (candidates.some(isActiveStatus)) return []` — applied to today AND every earlier day at once. A booking left `seated`/`arrived` overnight is *active*, so the sweep never fired and its table stayed `occupied` indefinitely.

## Fix

Split the predicate: past service days (`serviceDayOf < today`) sweep unconditionally at rollover; today keeps the conservative gate (all terminal + last window passed). `src/utils/reservations.ts:64`.

## RED / GREEN

| Stage | Command | Result |
|---|---|---|
| RED | prod reverted to `HEAD`, `npx vitest run src/utils/reservations.endOfDay.test.ts` | `2 failed \| 6 passed` — new cases returned `[]` instead of `['yesterday']` (leftover seated booking blocked the sweep) |
| GREEN | fix restored, same command | `8 passed` |

RED excerpt:
```
FAIL > endOfDayArchivableIds > sweeps past days while today is still mid-service
  expected [] to deeply equal [ 'yesterday' ]
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A past day is swept even when a party was left `seated` overnight | `reservations.endOfDay.test.ts:sweeps a past day even when a party was left seated overnight` | unit | PASS |
| 2 | Past days sweep while today is still mid-service (today kept) | `reservations.endOfDay.test.ts:sweeps past days while today is still mid-service` | unit | PASS |
| 3 | Today does not fire while a booking is still active | existing case | unit | PASS |
| 4 | Today does not fire before the last window passed | existing case | unit | PASS |
| 5 | Future days are never swept | existing case | unit | PASS |

## Coverage / known gaps

- `endOfDayArchivableIds` fully branch-covered by the 8 cases.
- Untested (unchanged) wiring: `useEndOfDayReset` interval hook + `resetService` (both pre-existing, covered by `floorStore.test.ts` for reset).
- **Known limitation**: `resetService()` is all-or-nothing — clears the entire floor on any sweep. A brand-new booking seated in the first minute after midnight while a past day still has leftovers would be wiped too. Matches the "reset all tables at 00:00" intent; flagged for follow-up if today's live seatings should be spared.
