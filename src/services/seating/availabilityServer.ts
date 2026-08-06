import type {
  BookingRestrictions,
  OpeningHours,
  ReservationRulesConfig,
  SeatingConfig,
} from '@/types'
import {
  checkAvailability,
  type AvailabilityInput,
  type AvailabilityResult,
} from '@/services/availability'
import { evaluateBookingRules } from '@/services/settings/bookingRules'
import {
  DEFAULT_BOOKING_RESTRICTIONS,
  DEFAULT_OPENING_HOURS,
  DEFAULT_RESERVATION_RULES,
} from '@/services/settings/defaults'
import {
  connectionFromRow,
  obstacleFromRow,
  tableFromRow,
  tableTypeFromRow,
  zoneFromRow,
  type ConnectionRow,
  type ObstacleRow,
  type TableRow,
  type TableTypeRow,
  type ZoneRow,
} from '@/services/supabase/layoutMappers'
import { reservationFromRow, type ReservationRow } from '@/services/supabase/mappers'
import type { SeatingFloor } from './types'
import { DEFAULT_SEATING_CONFIG } from './defaultConfig'

/**
 * Server-side availability entry (Phase 9). Bundled (esbuild) and run inside the
 * Supabase Edge Function so the SERVER is the final authority: it reads the
 * latest layout + reservations from the database and runs the SAME seating
 * engine as the client. This module is plain/pure (no store, no browser deps) so
 * it bundles cleanly for Deno, and it's type-checked by the normal build.
 */

/** Raw DB rows the function fetches (snake_case), passed straight in. */
export interface AvailabilityData {
  tableTypes: TableTypeRow[]
  zones: ZoneRow[]
  tables: TableRow[]
  connections: ConnectionRow[]
  obstacles: ObstacleRow[]
  reservations: ReservationRow[]
  /** Per-restaurant seating config; falls back to the app default when unset. */
  seating?: SeatingConfig | null
  /** Booking-rule config (Phase 11). Absent/partial rows fall back to defaults. */
  openingHours?: OpeningHours | null
  reservationRules?: Partial<ReservationRulesConfig> | null
  bookingRestrictions?: Partial<BookingRestrictions> | null
}

export async function evaluateAvailability(
  input: AvailabilityInput,
  data: AvailabilityData,
): Promise<AvailabilityResult> {
  const floor: SeatingFloor = {
    tables: data.tables.map(tableFromRow),
    tableTypes: data.tableTypes.map(tableTypeFromRow),
    zones: data.zones.map(zoneFromRow),
    obstacles: data.obstacles.map(obstacleFromRow),
    mergedGroups: data.connections.map(connectionFromRow),
    config: hasConfig(data.seating) ? data.seating : DEFAULT_SEATING_CONFIG,
  }
  // Configured booking-rule gate (Phase 11) — the server is the final authority,
  // so it enforces the same rules as the two client forms (closure, blackout
  // dates, opening hours, reservation/party window, zone availability) before
  // spending effort on the physical-fit check.
  const violation = evaluateBookingRules({
    partySize: input.partySize,
    dateTime: input.dateTime,
    preferredZoneId: input.zoneId,
    openingHours:
      Array.isArray(data.openingHours) && data.openingHours.length === 7
        ? data.openingHours
        : DEFAULT_OPENING_HOURS,
    rules: { ...DEFAULT_RESERVATION_RULES, ...(data.reservationRules ?? {}) },
    restrictions: {
      blocks: data.bookingRestrictions?.blocks ?? [],
      closure: {
        ...DEFAULT_BOOKING_RESTRICTIONS.closure,
        ...(data.bookingRestrictions?.closure ?? {}),
      },
    },
    zones: floor.zones,
    now: new Date(),
    isNew: true,
  })[0]
  if (violation) {
    return { available: false, reason: { key: `rules.${violation.code}`, params: violation.params } }
  }

  const others = data.reservations.map(reservationFromRow)
  return checkAvailability(input, floor, others)
}

/** A seeded-but-empty settings row stores `{}`; treat that as "use the default". */
function hasConfig(value: SeatingConfig | null | undefined): value is SeatingConfig {
  return !!value && typeof value === 'object' && 'merge' in value
}
