import type {
  ID,
  Reservation,
  ReservationOccasion,
  ReservationPreferences,
  ReservationSource,
  ReservationStatus,
} from '@/types'

/**
 * Row <-> domain mappers (Phase 9).
 *
 * The database is snake_case and uses NULL; the domain model is camelCase and
 * uses `undefined` for absent optionals. These pure functions are the single
 * place that reconciles the two, so repositories and stores never see a raw row.
 */

/** Shape of a `reservations` row as returned by PostgREST. */
export interface ReservationRow {
  id: string
  restaurant_id: string
  guest_name: string
  phone: string | null
  email: string | null
  party_size: number
  date_time: string
  estimated_duration: number
  preferred_zone_id: string | null
  preferred_table_id: string | null
  assigned_table_ids: string[] | null
  occasion: string | null
  status: string
  source: string
  preferences: ReservationPreferences | null
  notes: string | null
  created_at: string
  updated_at: string
}

export function reservationFromRow(row: ReservationRow): Reservation {
  return {
    id: row.id,
    guestName: row.guest_name,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    partySize: row.party_size,
    dateTime: row.date_time,
    estimatedDuration: row.estimated_duration,
    preferredZoneId: row.preferred_zone_id ?? undefined,
    preferredTableId: row.preferred_table_id ?? undefined,
    assignedTableIds: row.assigned_table_ids ?? undefined,
    occasion: (row.occasion as ReservationOccasion | null) ?? undefined,
    status: row.status as ReservationStatus,
    source: row.source as ReservationSource,
    preferences: row.preferences ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Full row for insert. `undefined` -> `null` so PostgREST clears the column. */
export function reservationToRow(restaurantId: ID, r: Reservation): ReservationRow {
  return {
    id: r.id,
    restaurant_id: restaurantId,
    guest_name: r.guestName,
    phone: r.phone ?? null,
    email: r.email ?? null,
    party_size: r.partySize,
    date_time: r.dateTime,
    estimated_duration: r.estimatedDuration,
    preferred_zone_id: r.preferredZoneId ?? null,
    preferred_table_id: r.preferredTableId ?? null,
    assigned_table_ids: r.assignedTableIds ?? null,
    occasion: r.occasion ?? null,
    status: r.status,
    source: r.source,
    preferences: r.preferences ?? null,
    notes: r.notes ?? null,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }
}
