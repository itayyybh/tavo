/**
 * Top-level entry point for the Seating Engine (Phase 7).
 *
 * `suggestSeating` ties the stages together: generate candidates → drop the
 * infeasible ones (`canSeat`) → score and rank the rest. Returns suggestions
 * best-first. Pure and store-free — callers assemble the `SeatingFloor` snapshot
 * and pass the other reservations in.
 */
import type { Reservation } from '@/types'
import { canSeat } from './canSeat'
import { generateCandidates } from './candidates'
import { ruleScorer } from './ruleScorer'
import type { SeatingFloor, SeatingReason, SeatingScorer, Suggestion } from './types'

/** How many suggestions to return by default. */
export const DEFAULT_SUGGESTION_LIMIT = 5

/**
 * Ranked seating suggestions for a reservation, best first.
 *
 * @param reservation the booking to seat
 * @param floor       read-only floor snapshot (tables, zones, config…)
 * @param others      every other reservation (for time-conflict detection)
 * @param limit       max suggestions to return
 * @param scorer      ranking strategy; defaults to the rule-based scorer
 */
export function suggestSeating(
  reservation: Reservation,
  floor: SeatingFloor,
  others: Reservation[] = [],
  limit: number = DEFAULT_SUGGESTION_LIMIT,
  scorer: SeatingScorer = ruleScorer,
): Suggestion[] {
  const feasible = generateCandidates(reservation, floor, others).filter(
    (candidate) => canSeat(reservation, candidate, floor, others).ok,
  )
  return scorer.rank(reservation, feasible, floor).slice(0, limit)
}

/**
 * Can the reservation's preferred zone EVER physically seat the party — a single
 * table or a rule-valid merge that reaches the party size, ignoring current
 * occupancy and time? Used by the create gate: aggregate seat capacity can say a
 * zone "has room" while no actual table or merge fits (e.g. a party of 8 in a
 * zone of 2-tops that can't merge that large). Reuses the real candidate + fit
 * logic on an all-available snapshot, so it honours merge/forbidden/large-party
 * and cross-zone bring rules exactly as the live engine would.
 */
export function zoneHasFit(reservation: Reservation, floor: SeatingFloor): boolean {
  const openFloor: SeatingFloor = {
    ...floor,
    tables: floor.tables.map((t) => ({ ...t, status: 'available' as const })),
  }
  return generateCandidates(reservation, openFloor, []).some(
    (candidate) => canSeat(reservation, candidate, openFloor, []).ok,
  )
}

/**
 * Why no option fits, for the empty state — so "No table fits" is actionable
 * instead of mysterious. Distinguishes the real reasons: nothing free in the
 * zone, the free tables can't reach the party size (capacity ceiling, bounded by
 * `maxMergeSize`), or tables that WOULD fit are booked in this window.
 */
export function explainNoFit(
  reservation: Reservation,
  floor: SeatingFloor,
  others: Reservation[] = [],
): SeatingReason {
  const candidates = generateCandidates(reservation, floor, others)
  if (candidates.length === 0) return { key: 'reason.noFreeTables' }

  const bigEnough = candidates.filter((c) => c.seats >= reservation.partySize)
  if (bigEnough.length === 0) {
    const max = Math.max(...candidates.map((c) => c.seats))
    return {
      key: 'reason.largestSeats',
      params: {
        max,
        party: reservation.partySize,
        limit: floor.config.merge.maxMergeSize ?? 0,
      },
    }
  }
  // Something is large enough but every such option was rejected → time conflict.
  return { key: 'reason.allBooked' }
}
