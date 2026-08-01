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
