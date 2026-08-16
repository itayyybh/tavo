import type { ID, Reservation, ReservationStatus } from '@/types'
import { isOnDay, minutesOfDay, toDateKey } from './datetime'

/**
 * Pure reservation domain helpers — labels, the status workflow, and
 * search/filter/sort. Kept OUT of the store so they're testable and cheap to
 * memoize. Nothing here touches tables (Phase 7 owns that link).
 */

// Human-readable labels live in the i18n `reservations` namespace
// (`useReservationLabels()`), keyed by these enum values.

// ---------------------------------------------------------------------------
// Status workflow — simple, predictable, explicit transition map.
// ---------------------------------------------------------------------------

/** Statuses a reservation may move to from each state. Empty = terminal. */
export const statusTransitions: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ['confirmed', 'waitlist', 'arrived', 'cancelled', 'no_show'],
  confirmed: ['arrived', 'seated', 'waitlist', 'cancelled', 'no_show'],
  waitlist: ['confirmed', 'arrived', 'seated', 'cancelled', 'no_show'],
  arrived: ['seated', 'completed', 'cancelled', 'no_show'],
  seated: ['completed', 'cancelled'],
  completed: ['pending'],
  cancelled: ['pending'],
  no_show: ['pending'],
}

/** Terminal statuses no longer count toward live service load. */
export const TERMINAL_STATUSES: ReservationStatus[] = [
  'completed',
  'cancelled',
  'no_show',
]

/** True when a reservation is still part of the live service (not terminal). */
export function isActiveStatus(status: ReservationStatus): boolean {
  return !TERMINAL_STATUSES.includes(status)
}

// ---------------------------------------------------------------------------
// History / end-of-day — pure helpers.
// ---------------------------------------------------------------------------

/** Local `YYYY-MM-DD` service day of a reservation (from its `dateTime`). */
export function serviceDayOf(r: Reservation): string {
  return toDateKey(new Date(r.dateTime))
}

/** Epoch-ms end of a reservation's booked window (start + estimated duration). */
export function reservationEnd(r: Reservation): number {
  return Date.parse(r.dateTime) + r.estimatedDuration * 60_000
}

/**
 * Ids to sweep into History at end-of-day, or `[]` if the day isn't over yet.
 *
 * The service is "done" only when, among the non-archived bookings for today or
 * any earlier day, EVERY one is terminal (completed/cancelled/no_show) AND the
 * latest booked window has already passed. This deliberately never fires
 * mid-service (a still-pending or still-seated booking blocks it) and never
 * touches future days. Pure — the caller archives the returned ids.
 */
export function endOfDayArchivableIds(
  reservations: Reservation[],
  now: number = Date.now(),
): ID[] {
  const today = toDateKey(new Date(now))
  const candidates = reservations.filter(
    (r) => !r.archived && serviceDayOf(r) <= today,
  )
  if (candidates.length === 0) return []
  if (candidates.some((r) => isActiveStatus(r.status))) return []
  const lastEnd = Math.max(...candidates.map(reservationEnd))
  if (now <= lastEnd) return []
  return candidates.map((r) => r.id)
}

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return statusTransitions[from].includes(to)
}

// ---------------------------------------------------------------------------
// Search / filter / sort — pure, composable.
// ---------------------------------------------------------------------------

export interface ReservationFilter {
  /** Local `YYYY-MM-DD` day key. Undefined = any day. */
  dayKey?: string
  /** Restrict to these statuses. Empty/undefined = all. */
  statuses?: ReservationStatus[]
  preferredZoneId?: ID
  /** Exact party size. Undefined = any. */
  partySize?: number
}

/** Case-insensitive match across guest name, phone, and id. */
export function matchesQuery(reservation: Reservation, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true
  const phone = reservation.phone ?? ''
  return (
    reservation.guestName.toLowerCase().includes(q) ||
    phone.toLowerCase().includes(q) ||
    reservation.id.toLowerCase().includes(q)
  )
}

export function filterReservations(
  list: Reservation[],
  filter: ReservationFilter,
): Reservation[] {
  return list.filter((r) => {
    if (filter.dayKey && !isOnDay(r.dateTime, filter.dayKey)) return false
    if (filter.statuses?.length && !filter.statuses.includes(r.status)) return false
    if (filter.preferredZoneId && r.preferredZoneId !== filter.preferredZoneId)
      return false
    if (filter.partySize != null && r.partySize !== filter.partySize) return false
    return true
  })
}

export type ReservationSortKey = 'time' | 'name' | 'partySize' | 'created'

/** Stable sort. Time ascending is the natural service order and the default. */
export function sortReservations(
  list: Reservation[],
  key: ReservationSortKey = 'time',
  dir: 'asc' | 'desc' = 'asc',
): Reservation[] {
  const sign = dir === 'asc' ? 1 : -1
  const compare: Record<ReservationSortKey, (a: Reservation, b: Reservation) => number> =
    {
      time: (a, b) => a.dateTime.localeCompare(b.dateTime),
      created: (a, b) => a.createdAt.localeCompare(b.createdAt),
      name: (a, b) => a.guestName.localeCompare(b.guestName),
      partySize: (a, b) => a.partySize - b.partySize,
    }
  return [...list].sort((a, b) => sign * compare[key](a, b))
}

export const SLOT_MINUTES = 30

export interface TimeSlot {
  /** Slot start in minutes since local midnight. */
  start: number
  items: Reservation[]
  /** Total guests in this slot (the "load"). */
  guests: number
}

/**
 * Bucket reservations into fixed slots spanning the earliest→latest arrival.
 * Shared by the timeline and the service-load chart so they never drift.
 */
export function bucketByTimeSlot(
  list: Reservation[],
  slotMinutes = SLOT_MINUTES,
): TimeSlot[] {
  if (list.length === 0) return []
  const times = list.map((r) => minutesOfDay(r.dateTime))
  const floor = Math.floor(Math.min(...times) / slotMinutes) * slotMinutes
  const ceil = Math.floor(Math.max(...times) / slotMinutes) * slotMinutes

  const slots: TimeSlot[] = []
  for (let start = floor; start <= ceil; start += slotMinutes) {
    const items = list
      .filter((r) => {
        const m = minutesOfDay(r.dateTime)
        return m >= start && m < start + slotMinutes
      })
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
    slots.push({
      start,
      items,
      guests: items.reduce((sum, r) => sum + r.partySize, 0),
    })
  }
  return slots
}

/** Statuses that occupy a zone's tables (a live/expected guest). */
const OCCUPYING_STATUSES: ReservationStatus[] = ['confirmed', 'arrived']

/**
 * How many of a zone's tables are already committed on a given day — i.e. active
 * (confirmed/arrived) reservations for that zone. Used to cap bookings at the
 * zone's table count. `ignoreId` excludes the reservation being edited.
 */
export function zoneReservationUsage(
  list: Reservation[],
  zoneId: ID,
  dayKey: string,
  ignoreId?: ID,
): number {
  return list.filter(
    (r) =>
      r.id !== ignoreId &&
      r.preferredZoneId === zoneId &&
      OCCUPYING_STATUSES.includes(r.status) &&
      isOnDay(r.dateTime, dayKey),
  ).length
}

/** True when a reservation falls in the [start, start+slotMinutes) slot. */
export function isInSlot(
  reservation: Reservation,
  start: number,
  slotMinutes = SLOT_MINUTES,
): boolean {
  const m = minutesOfDay(reservation.dateTime)
  return m >= start && m < start + slotMinutes
}

/** At-a-glance service metrics for the summary dashboard. */
export interface ReservationSummaryData {
  count: number
  totalGuests: number
  confirmed: number
  arrived: number
  vip: number
  avgParty: number
}

/** Aggregate a list into headline service metrics. Pure + cheap (single pass). */
export function summarizeReservations(list: Reservation[]): ReservationSummaryData {
  let totalGuests = 0
  let confirmed = 0
  let arrived = 0
  let vip = 0
  for (const r of list) {
    totalGuests += r.partySize
    if (r.status === 'confirmed') confirmed += 1
    if (r.status === 'arrived') arrived += 1
    if (r.preferences?.vip) vip += 1
  }
  const count = list.length
  return {
    count,
    totalGuests,
    confirmed,
    arrived,
    vip,
    avgParty: count ? totalGuests / count : 0,
  }
}

const MINUTE = 60_000

/** Double-booked tables and the reservations involved (see `findAssignmentConflicts`). */
export interface AssignmentConflicts {
  /** Table ids held by ≥2 active reservations whose windows overlap (± buffer). */
  tableIds: Set<ID>
  /** Reservations sharing a table with an overlapping active reservation. */
  reservationIds: Set<ID>
}

/**
 * Detect assignment conflicts across the booking sheet: any table held by two
 * active reservations whose windows overlap once padded by the turnover buffer.
 *
 * The engine prevents these at assign time, but they can still arise after the
 * fact — e.g. editing a reservation's time or duration so it now overlaps a
 * booking it shares a table with. Surfacing them matters because the Live Floor
 * ties one table to a single reservation (first-writer-wins), so a silent
 * double-book would otherwise HIDE one of the bookings. Pure + O(n²) over the
 * assigned set (small in practice).
 */
export function findAssignmentConflicts(
  reservations: Reservation[],
  bufferMin: number,
): AssignmentConflicts {
  const buffer = bufferMin * MINUTE
  const active = reservations.filter(
    (r) => isActiveStatus(r.status) && (r.assignedTableIds?.length ?? 0) > 0,
  )
  const tableIds = new Set<ID>()
  const reservationIds = new Set<ID>()
  for (let i = 0; i < active.length; i += 1) {
    const a = active[i]
    const aStart = Date.parse(a.dateTime)
    const aEnd = aStart + a.estimatedDuration * MINUTE
    for (let j = i + 1; j < active.length; j += 1) {
      const b = active[j]
      const bStart = Date.parse(b.dateTime)
      const bEnd = bStart + b.estimatedDuration * MINUTE
      // Windows must overlap once each end is padded by the turnover buffer.
      if (!(aStart < bEnd + buffer && bStart < aEnd + buffer)) continue
      const bTables = b.assignedTableIds ?? []
      const shared = (a.assignedTableIds ?? []).filter((id) => bTables.includes(id))
      if (shared.length === 0) continue
      for (const id of shared) tableIds.add(id)
      reservationIds.add(a.id)
      reservationIds.add(b.id)
    }
  }
  return { tableIds, reservationIds }
}

/**
 * Duplicate heuristic — same guest name + same party size within 90 minutes.
 * Used for a soft WARNING only; never blocks (see the `data-model` rules).
 */
export function findDuplicate(
  list: Reservation[],
  candidate: Pick<Reservation, 'guestName' | 'partySize' | 'dateTime'>,
  ignoreId?: ID,
): Reservation | undefined {
  const t = new Date(candidate.dateTime).getTime()
  if (Number.isNaN(t)) return undefined
  const WINDOW_MS = 90 * 60 * 1000
  const name = candidate.guestName.trim().toLowerCase()
  return list.find((r) => {
    if (r.id === ignoreId) return false
    if (r.guestName.trim().toLowerCase() !== name) return false
    if (r.partySize !== candidate.partySize) return false
    const rt = new Date(r.dateTime).getTime()
    return !Number.isNaN(rt) && Math.abs(rt - t) <= WINDOW_MS
  })
}
