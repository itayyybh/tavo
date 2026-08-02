/**
 * Candidate scoring for the Seating Engine (Phase 7).
 *
 * Given a feasible candidate (already passed `canSeat`), produce a score and the
 * human reasons behind it. Higher is better. Every weight is configurable
 * (`SeatingConfig.weights` / `merge.proximityWeight`) so seating behaviour is a
 * restaurant policy decision, never hardcoded.
 *
 * Factors:
 * - capacity fit — tighter fit (fewer wasted seats) scores higher.
 * - zone match — the reservation's preferred zone.
 * - preferred table — the reservation's requested table is included.
 * - single over merge — prefer one table when it fits.
 * - proximity (merges) — physically tight merges score higher.
 */
import type { Reservation } from '@/types'
import { boundingBoxOf } from './geometry'
import type { SeatCandidate, SeatingFloor, Suggestion } from './types'

/** Diagonal span (world units) of a candidate's tables; 0 for a single. */
function span(candidate: SeatCandidate): number {
  const box = boundingBoxOf(candidate.tables)
  return box ? Math.hypot(box.width, box.height) : 0
}

/**
 * Score a feasible candidate for a reservation. Returns the candidate wrapped as
 * a `Suggestion` with its score and reason chips.
 */
export function scoreCandidate(
  reservation: Reservation,
  candidate: SeatCandidate,
  floor: SeatingFloor,
): Suggestion {
  const { weights, merge } = floor.config
  const reasons: string[] = []
  let score = 0

  // Capacity fit — reward the least wasted seats.
  const waste = candidate.seats - reservation.partySize
  score += weights.capacityFit / (1 + Math.max(0, waste))
  if (waste === 0) reasons.push('Exact fit')
  else reasons.push(`Seats ${candidate.seats} for ${reservation.partySize}`)

  // Zone tiers: in the preferred zone > bring a table INTO it > another zone.
  const preferred = reservation.preferredZoneId
  if (preferred && candidate.zoneId === preferred) {
    score += weights.zoneMatch
    reasons.push('Preferred zone')
  } else if (preferred && candidate.relocateToZoneId === preferred) {
    // Second choice: keep the preferred zone by bringing a free table over.
    score += weights.zoneMatch * 0.6
    reasons.push('Bring to preferred zone')
  }

  // Preferred table.
  if (
    reservation.preferredTableId &&
    candidate.tableIds.includes(reservation.preferredTableId)
  ) {
    score += weights.preferredTable
    reasons.push('Requested table')
  }

  if (candidate.kind === 'single') {
    score += weights.singleTable
    reasons.push('Single table')
  } else {
    // Proximity — a tighter merge (smaller span) scores higher.
    score += (merge.proximityWeight * 100) / (100 + span(candidate))
    reasons.push(`Merge of ${candidate.tables.length}`)
  }

  return { candidate, score, reasons }
}
