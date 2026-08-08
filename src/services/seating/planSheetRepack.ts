/**
 * Whole-sheet repack planner (Phase 12, A1) — pure.
 *
 * `planSheetRepack` builds ONE combined plan that seats every active booking the
 * greedy engine can't place directly, by reshuffling other tentative (`auto`)
 * holds. It's the batch counterpart to `optimizeAssignments`: it walks the
 * unseated bookings in time order, feeding each successful repack forward on a
 * working copy so later ones see the freed/taken tables, then returns the NET
 * assignment changes for a preview-then-apply flow.
 *
 * Scope: repack only. Bookings the greedy engine CAN seat directly are left for
 * `useAssignAll` — this planner exists for the hard cases that need a reshuffle.
 * Pure and store-free; the caller applies the moves and logs them.
 */
import type { ID, Reservation } from '@/types'
import { isActiveStatus } from '@/utils'
import { optimizeAssignments, type AssignmentMove } from './optimizeAssignments'
import { suggestSeating } from './suggest'
import type { SeatingFloor } from './types'

/** A combined repack across the whole booking sheet. */
export interface SheetRepackPlan {
  /** Ids of the bookings this plan newly seats (each via a reshuffle). */
  seated: ID[]
  /** Net assignment changes to apply — seated targets and displaced holds alike. */
  moves: AssignmentMove[]
}

const held = (r: Reservation): ID[] => r.assignedTableIds ?? []

/** Same table set regardless of order. */
const sameTables = (a: ID[], b: ID[]): boolean =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join()

/** An active booking with no table yet — a candidate to seat. */
const needsSeat = (r: Reservation): boolean =>
  isActiveStatus(r.status) && held(r).length === 0

/**
 * Plan a repack of the whole sheet: seat every unseated active booking that a
 * reshuffle can fit. Returns the bookings seated and the net moves to apply.
 */
export function planSheetRepack(
  reservations: Reservation[],
  floor: SeatingFloor,
): SheetRepackPlan {
  const original = new Map(reservations.map((r) => [r.id, held(r)]))
  let working = [...reservations]
  const seated: ID[] = []

  const queue = working
    .filter(needsSeat)
    .sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime))

  for (const res of queue) {
    // Only repack the ones greedy can't seat directly — direct fits are
    // Assign-all's job, not a reshuffle case.
    const others = working.filter((r) => r.id !== res.id)
    if (suggestSeating(res, floor, others).length > 0) continue

    const plan = optimizeAssignments(res, floor, working)
    if (!plan) continue

    for (const m of plan.moves) {
      working = working.map((r) =>
        r.id === m.reservationId
          ? { ...r, assignedTableIds: m.toTableIds, assignmentSource: 'auto' as const }
          : r,
      )
    }
    seated.push(res.id)
  }

  // Net diff vs the original assignments — every booking whose tables changed.
  const moves: AssignmentMove[] = []
  for (const r of working) {
    const from = original.get(r.id) ?? []
    const to = held(r)
    if (!sameTables(from, to)) {
      moves.push({ reservationId: r.id, fromTableIds: from, toTableIds: to })
    }
  }

  return { seated, moves }
}
