/**
 * Hard feasibility check for the Seating Engine (Phase 7).
 *
 * `canSeat` decides whether a candidate can hold a reservation at all. Only hard
 * constraints live here — soft preferences are handled by the scorer. A rejected
 * candidate is dropped before ranking; its reasons feed the empty-state UI.
 *
 * Checks:
 * - capacity: the option seats the whole party.
 * - time: the option's tables are free for the booking window plus a turnover
 *   buffer, versus every other active reservation's assignment.
 *
 * (Accessibility / smoking / window checks are intentionally absent: the table &
 * zone models carry no such attributes yet. Add them here once they do.)
 */
import type { Reservation } from '@/types'
import { isActiveStatus } from '@/utils'
import type { CanSeatResult, SeatCandidate, SeatingFloor, SeatingReason } from './types'

const MINUTE = 60_000

/** Table ids a reservation currently holds (single or deferred merge). */
function heldTableIds(reservation: Reservation): string[] {
  return reservation.assignedTableIds ?? []
}

/** Do two [start, end] windows overlap once each end is padded by `buffer` ms? */
function windowsCollide(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  buffer: number,
): boolean {
  return aStart < bEnd + buffer && bStart < aEnd + buffer
}

/**
 * Is the candidate free of time conflicts for this reservation, given every
 * other reservation's current assignment?
 */
function hasTimeConflict(
  reservation: Reservation,
  candidate: SeatCandidate,
  floor: SeatingFloor,
  others: Reservation[],
): boolean {
  const start = Date.parse(reservation.dateTime)
  const end = start + reservation.estimatedDuration * MINUTE
  const buffer = floor.config.turnoverBufferMin * MINUTE
  const wanted = new Set(candidate.tableIds)

  return others.some((other) => {
    if (other.id === reservation.id) return false
    if (!isActiveStatus(other.status)) return false
    const held = heldTableIds(other)
    if (!held.some((id) => wanted.has(id))) return false
    const oStart = Date.parse(other.dateTime)
    const oEnd = oStart + other.estimatedDuration * MINUTE
    return windowsCollide(start, end, oStart, oEnd, buffer)
  })
}

/**
 * Can this candidate seat the reservation? Returns ok plus rejection reasons.
 * `others` is every other reservation (for time-conflict detection).
 */
export function canSeat(
  reservation: Reservation,
  candidate: SeatCandidate,
  floor: SeatingFloor,
  others: Reservation[] = [],
): CanSeatResult {
  const reasons: SeatingReason[] = []

  if (candidate.seats < reservation.partySize) {
    reasons.push({
      key: 'reason.seatsPartyOf',
      params: { seats: candidate.seats, party: reservation.partySize },
    })
  }
  if (hasTimeConflict(reservation, candidate, floor, others)) {
    reasons.push({ key: 'reason.bookedAtTime' })
  }

  return { ok: reasons.length === 0, reasons }
}
