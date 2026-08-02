import type { ID, Reservation, Table, TableType } from '@/types'
import { isActiveStatus } from './reservations'

const MINUTE = 60_000

/**
 * A zone's maximum seating — the sum of its tables' solo capacities. An optimistic
 * ceiling (merging only reduces seats), used as the denominator for the zone
 * capacity gate: a reservation can be created only if its zone still has room.
 */
export function zoneSeatCapacity(
  zoneId: ID,
  tables: Table[],
  tableTypes: TableType[],
): number {
  return tables
    .filter((t) => t.zoneId === zoneId)
    .reduce(
      (sum, t) => sum + (tableTypes.find((ty) => ty.id === t.typeId)?.soloCapacity ?? 0),
      0,
    )
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

export interface ZoneRemainingParams {
  zoneId: ID
  /** ISO start of the party's window. */
  startISO: string
  durationMin: number
  tables: Table[]
  tableTypes: TableType[]
  reservations: Reservation[]
  bufferMin: number
  /** Skip this reservation (when editing an existing one). */
  excludeId?: ID
}

/**
 * Seats still free in a zone during a party's window: the zone's capacity minus
 * the party sizes of same-zone active reservations whose time overlaps (± the
 * turnover buffer). Time-windowed, so one zone serves different parties across the
 * service; a guest is only ever counted against their own preferred zone.
 */
export function zoneRemainingSeats({
  zoneId,
  startISO,
  durationMin,
  tables,
  tableTypes,
  reservations,
  bufferMin,
  excludeId,
}: ZoneRemainingParams): number {
  const capacity = zoneSeatCapacity(zoneId, tables, tableTypes)
  const start = Date.parse(startISO)
  const end = start + durationMin * MINUTE
  const buffer = bufferMin * MINUTE
  const committed = reservations
    .filter(
      (r) =>
        (excludeId == null || r.id !== excludeId) &&
        r.preferredZoneId === zoneId &&
        isActiveStatus(r.status),
    )
    .filter((r) => {
      const rs = Date.parse(r.dateTime)
      return windowsCollide(start, end, rs, rs + r.estimatedDuration * MINUTE, buffer)
    })
    .reduce((sum, r) => sum + r.partySize, 0)
  return capacity - committed
}

/**
 * Earliest start time (ISO) at/after the requested one when a zone has room for
 * `partySize` — or null if it never fits (the party exceeds the zone's total
 * capacity, so no time can ever hold it).
 *
 * The zone only gains seats when an overlapping reservation ends, so the sole
 * candidate start times are those boundaries: each same-zone active
 * reservation's end plus the turnover buffer. We test each in order and return
 * the first that fits — the next realistic opening for that party.
 */
export function zoneNextFreeTime(
  params: ZoneRemainingParams,
  partySize: number,
): string | null {
  const { zoneId, tables, tableTypes, reservations, bufferMin, excludeId } = params
  // No time can ever hold a party larger than the zone's whole capacity.
  if (partySize > zoneSeatCapacity(zoneId, tables, tableTypes)) return null
  const buffer = bufferMin * MINUTE
  const requested = Date.parse(params.startISO)

  // Candidate starts: every blocking reservation's (end + buffer) at/after the
  // requested time — sorted ascending, de-duplicated. (The requested time itself
  // is already known not to fit; the caller only asks when the zone is full.)
  const candidates = [
    ...new Set(
      reservations
        .filter(
          (r) =>
            (excludeId == null || r.id !== excludeId) &&
            r.preferredZoneId === zoneId &&
            isActiveStatus(r.status),
        )
        .map((r) => Date.parse(r.dateTime) + r.estimatedDuration * MINUTE + buffer)
        .filter((t) => t > requested),
    ),
  ].sort((a, b) => a - b)

  for (const start of candidates) {
    const remaining = zoneRemainingSeats({
      ...params,
      startISO: new Date(start).toISOString(),
    })
    if (remaining >= partySize) return new Date(start).toISOString()
  }
  return null
}
