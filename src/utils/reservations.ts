import type {
  ID,
  Reservation,
  ReservationOccasion,
  ReservationSource,
  ReservationStatus,
} from '@/types'
import { isOnDay } from './datetime'

/**
 * Pure reservation domain helpers — labels, the status workflow, and
 * search/filter/sort. Kept OUT of the store so they're testable and cheap to
 * memoize. Nothing here touches tables (Phase 7 owns that link).
 */

// ---------------------------------------------------------------------------
// Labels — single source of truth for human-readable text.
// ---------------------------------------------------------------------------

export const statusLabel: Record<ReservationStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  seated: 'Seated',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
  waitlist: 'Waitlist',
}

export const sourceLabel: Record<ReservationSource, string> = {
  manual: 'Manual',
  phone: 'Phone',
  walk_in: 'Walk-In',
  website: 'Website',
  google: 'Google',
}

export const occasionLabel: Record<ReservationOccasion, string> = {
  birthday: 'Birthday',
  anniversary: 'Anniversary',
  business: 'Business',
  date: 'Date',
  celebration: 'Celebration',
  other: 'Other',
}

// ---------------------------------------------------------------------------
// Status workflow — simple, predictable, explicit transition map.
// ---------------------------------------------------------------------------

/** Statuses a reservation may move to from each state. Empty = terminal. */
export const statusTransitions: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ['confirmed', 'waitlist', 'arrived', 'cancelled', 'no_show'],
  confirmed: ['arrived', 'waitlist', 'cancelled', 'no_show'],
  waitlist: ['confirmed', 'arrived', 'cancelled', 'no_show'],
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

export function canTransition(
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
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
