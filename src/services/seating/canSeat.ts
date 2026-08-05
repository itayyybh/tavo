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
 * Table ids held by another active reservation whose window overlaps this
 * reservation's (± turnover buffer) — the tables NOT free to seat this booking.
 * Candidate generation uses it to avoid proposing occupied tables.
 */
export function busyTableIds(
  reservation: Reservation,
  floor: SeatingFloor,
  others: Reservation[],
): Set<string> {
  const start = Date.parse(reservation.dateTime)
  const end = start + reservation.estimatedDuration * MINUTE
  const buffer = floor.config.turnoverBufferMin * MINUTE
  const busy = new Set<string>()
  for (const other of others) {
    if (other.id === reservation.id || !isActiveStatus(other.status)) continue
    const oStart = Date.parse(other.dateTime)
    const oEnd = oStart + other.estimatedDuration * MINUTE
    if (!windowsCollide(start, end, oStart, oEnd, buffer)) continue
    for (const id of heldTableIds(other)) busy.add(id)
  }
  return busy
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
  const busy = busyTableIds(reservation, floor, others)
  return candidate.tableIds.some((id) => busy.has(id))
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
  } else if (
    candidate.kind === 'single' &&
    candidate.seats - reservation.partySize > floor.config.maxUnderfill
  ) {
    // Too big — wastes more than the allowed slack (e.g. a party of 3 at an
    // 8-top). Only guards SINGLE tables: a merge must combine whatever's free,
    // so its overshoot is unavoidable — the scorer ranks tighter merges higher.
    reasons.push({
      key: 'reason.tooLarge',
      params: { seats: candidate.seats, party: reservation.partySize },
    })
  }
  if (hasTimeConflict(reservation, candidate, floor, others)) {
    reasons.push({ key: 'reason.bookedAtTime' })
  }

  return { ok: reasons.length === 0, reasons }
}
