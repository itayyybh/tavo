import type {
  ID,
  Reservation,
  ReservationOccasion,
  ReservationPreferences,
  ReservationSource,
  ReservationStatus,
  RestaurantSettingsConfig,
  SeatingConfig,
} from '@/types'
import { DEFAULT_SEATING_CONFIG } from '@/services/seating/defaultConfig'

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

/** Shape of a `restaurant_settings` row as returned by PostgREST. */
export interface RestaurantSettingsRow {
  restaurant_id: string
  seating: SeatingConfig | Record<string, never>
  grid_size: number
  snap_to_grid: boolean
  path_width: number
  auto_turnover: boolean
  default_stay_minutes: number
  max_stay_minutes: number
  reserved_lookahead_min: number
  waitlist_enabled: boolean
  updated_at: string
}

/**
 * Fill any missing seating keys from the app defaults. The 0002 bootstrap seeds
 * `seating` as `{}`, and older rows may predate a config field, so a raw row can
 * carry a partial (or empty) blob. Merging over the defaults — top level plus the
 * nested `merge`/`weights` groups — guarantees a complete config either way.
 */
function seatingWithDefaults(raw: RestaurantSettingsRow['seating']): SeatingConfig {
  const s = (raw ?? {}) as Partial<SeatingConfig>
  return {
    ...DEFAULT_SEATING_CONFIG,
    ...s,
    merge: { ...DEFAULT_SEATING_CONFIG.merge, ...s.merge },
    weights: { ...DEFAULT_SEATING_CONFIG.weights, ...s.weights },
  }
}

/** Row -> the DB-persisted settings config. Missing seating keys fall back to defaults. */
export function settingsFromRow(row: RestaurantSettingsRow): RestaurantSettingsConfig {
  return {
    gridSize: row.grid_size,
    snapToGrid: row.snap_to_grid,
    pathWidth: row.path_width,
    autoTurnover: row.auto_turnover,
    defaultStayMinutes: row.default_stay_minutes,
    maxStayMinutes: row.max_stay_minutes,
    reservedLookaheadMin: row.reserved_lookahead_min,
    waitlistEnabled: row.waitlist_enabled,
    seating: seatingWithDefaults(row.seating),
  }
}

/** Config -> a full row for upsert. `updated_at` is set by the database default. */
export function settingsToRow(
  restaurantId: ID,
  config: RestaurantSettingsConfig,
): Omit<RestaurantSettingsRow, 'updated_at'> {
  return {
    restaurant_id: restaurantId,
    seating: config.seating,
    grid_size: config.gridSize,
    snap_to_grid: config.snapToGrid,
    path_width: config.pathWidth,
    auto_turnover: config.autoTurnover,
    default_stay_minutes: config.defaultStayMinutes,
    max_stay_minutes: config.maxStayMinutes,
    reserved_lookahead_min: config.reservedLookaheadMin,
    waitlist_enabled: config.waitlistEnabled,
  }
}
