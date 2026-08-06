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
import type { SeatCandidate, SeatingFloor, SeatingReason, Suggestion } from './types'

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
  const reasons: SeatingReason[] = []
  let score = 0

  // Capacity fit — reward the least wasted seats.
  const waste = candidate.seats - reservation.partySize
  score += weights.capacityFit / (1 + Math.max(0, waste))
  if (waste === 0) reasons.push({ key: 'reason.exactFit' })
  else
    reasons.push({
      key: 'reason.seatsFor',
      params: { seats: candidate.seats, party: reservation.partySize },
    })

  // Zone tiers: in the preferred zone > bring a table INTO it > another zone.
  const preferred = reservation.preferredZoneId
  if (preferred && candidate.zoneId === preferred) {
    score += weights.zoneMatch
    reasons.push({ key: 'reason.preferredZone' })
  } else if (preferred && candidate.relocateToZoneId === preferred) {
    // Second choice: keep the preferred zone by bringing a free table over.
    score += weights.zoneMatch * 0.6
    reasons.push({ key: 'reason.bringToPreferredZone' })
  }

  // Preferred table.
  if (
    reservation.preferredTableId &&
    candidate.tableIds.includes(reservation.preferredTableId)
  ) {
    score += weights.preferredTable
    reasons.push({ key: 'reason.requestedTable' })
  }

  if (candidate.kind === 'single') {
    score += weights.singleTable
    reasons.push({ key: 'reason.singleTable' })
  } else {
    // Proximity — a tighter merge (smaller span) scores higher.
    score += (merge.proximityWeight * 100) / (100 + span(candidate))
    reasons.push({ key: 'reason.mergeOf', params: { count: candidate.tables.length } })

    // Soft preferred combo (Phase 11): boost a merge whose exact table set matches
    // a host-listed combo for this zone + party size. A preference, not a gate.
    const preferredCombos = merge.preferredCombos ?? []
    if (preferredCombos.length > 0) {
      const zoneName = floor.zones.find((z) => z.id === candidate.zoneId)?.name
      const labels = new Set(candidate.tables.map((t) => t.label))
      const matches = preferredCombos.some(
        (pc) =>
          pc.zoneName === zoneName &&
          reservation.partySize >= pc.minPartySize &&
          pc.combo.length === labels.size &&
          pc.combo.every((l) => labels.has(l)),
      )
      if (matches) {
        score += weights.preferredCombo
        reasons.push({ key: 'reason.preferredCombo' })
      }
    }
  }

  return { candidate, score, reasons }
}
