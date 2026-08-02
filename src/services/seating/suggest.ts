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
