import type { SeatingConfig } from '@/types'
import {
  checkAvailability,
  type AvailabilityInput,
  type AvailabilityResult,
} from '@/services/availability'
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
  const others = data.reservations.map(reservationFromRow)
  return checkAvailability(input, floor, others)
}

/** A seeded-but-empty settings row stores `{}`; treat that as "use the default". */
function hasConfig(value: SeatingConfig | null | undefined): value is SeatingConfig {
  return !!value && typeof value === 'object' && 'merge' in value
}
