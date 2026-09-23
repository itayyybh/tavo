# Known issues

Defects and gaps found by reading the code rather than by hitting them in
service. Each one was surfaced while writing questions for the codebase-rag
golden set: writing a question forces you to state the correct answer, and
three times the correct answer turned out to be "the code does not do what it
says."

Not yet fixed. Listed with the evidence so the fix does not start from scratch.

---

## 1. `parse-request` edge function is not in the repository

**Where:** `src/services/requests/parseNotes.ts`, `src/types/index.ts:193`,
`supabase/functions/`

`parseNotes` invokes an edge function named `parse-request`. The client
docstring and the `ParsedRequest` type both state that the server reads the
caller's floor and validates the model's output against the real layout —
"labels/shapes that don't exist are dropped." That validation is the only thing
standing between a hallucinated table label and the seating engine.

`supabase/functions/` contains `check-availability` and `whatsapp-webhook`.
There is no `parse-request` directory. The function is presumably deployed but
was never committed.

**Why it matters:** the guarantee cannot be reviewed, tested, or redeployed from
this repository, and it is the guarantee that constrains model output. A second
reference in `docs/phase-12-whatsapp-setup-and-test.md:21` notes the
`ANTHROPIC_API_KEY` is "shared with `parse-request`", so the function is real
and running.

**Fix:** commit the function source under `supabase/functions/parse-request/`.

---

## 2. Occupancy header and the seating engine count seats differently

**Where:** `src/services/floor/summarize.ts` vs `src/utils/capacity.ts`

`summarizeFloor` counts seats per table using solo capacity via `seatsForTable`.
The file states the limitation outright: "merged-group connected capacity is a
later refinement."

`src/utils/capacity.ts` applies a different rule for merged groups — the largest
table keeps its solo capacity, the others contribute connected capacity, and
from three tables up a seat is subtracted per joint.

**Why it matters:** with tables pushed together, the total-seats and free-seats
figures in the summary header do not agree with the capacity the seating engine
reasons about. Two numbers describing the same floor, computed two ways.

**Fix:** have `summarizeFloor` resolve merged groups through the same capacity
utility, or state the limitation in the UI.

---

## 3. An owner cannot leave a restaurant

**Where:** `supabase/migrations/0010_team_management.sql`

`remove_member` refuses when the target is the caller, and refuses when the
target's role is `owner`, so a restaurant always keeps at least its owner. The
comment says the intended path is to demote first — "role changes are a later
step."

Role changes were never implemented. There is no RPC that changes a membership's
role, so the intended escape hatch does not exist.

**Why it matters:** ownership cannot be transferred and an owner cannot remove
themselves. For a single-owner pilot this is invisible; it becomes a support
request the first time a restaurant changes hands.

**Fix:** add an owner-only `set_member_role` RPC, guarded so the last owner
cannot be demoted.
