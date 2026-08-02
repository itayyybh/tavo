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
import { scoreCandidate } from './score'
import type { SeatingFloor, Suggestion } from './types'

/** How many suggestions to return by default. */
export const DEFAULT_SUGGESTION_LIMIT = 5

/**
 * Ranked seating suggestions for a reservation, best first.
 *
 * @param reservation the booking to seat
 * @param floor       read-only floor snapshot (tables, zones, config…)
 * @param others      every other reservation (for time-conflict detection)
 * @param limit       max suggestions to return
 */
export function suggestSeating(
  reservation: Reservation,
  floor: SeatingFloor,
  others: Reservation[] = [],
  limit: number = DEFAULT_SUGGESTION_LIMIT,
): Suggestion[] {
  return generateCandidates(reservation, floor, others)
    .filter((candidate) => canSeat(reservation, candidate, floor, others).ok)
    .map((candidate) => scoreCandidate(reservation, candidate, floor))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
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
): string {
  const candidates = generateCandidates(reservation, floor, others)
  if (candidates.length === 0) return 'No free tables in the preferred zone right now.'

  const bigEnough = candidates.filter((c) => c.seats >= reservation.partySize)
  if (bigEnough.length === 0) {
    const max = Math.max(...candidates.map((c) => c.seats))
    return `The largest available table or merge seats ${max} — a party of ${reservation.partySize} needs more. Free up tables, or raise the merge limit (now ${floor.config.merge.maxMergeSize}).`
  }
  // Something is large enough but every such option was rejected → time conflict.
  return 'Every table big enough is booked at this time.'
}
