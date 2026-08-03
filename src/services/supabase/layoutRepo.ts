import type { ID, LayoutSnapshot } from '@/types'
import { supabase } from './client'
import {
  connectionFromRow,
  connectionToRow,
  obstacleFromRow,
  obstacleToRow,
  tableFromRow,
  tableToRow,
  tableTypeFromRow,
  tableTypeToRow,
  zoneFromRow,
  zoneToRow,
  type ConnectionRow,
  type ObstacleRow,
  type TableRow,
  type TableTypeRow,
  type ZoneRow,
} from './layoutMappers'

/**
 * Layout repository (Phase 9) — the tenant-scoped replacement for
 * `layoutStorage`. A restaurant's floor document lives across five normalized
 * tables; this assembles/replaces them as one `LayoutSnapshot`.
 */

/**
 * Load a restaurant's layout. Returns `null` when the restaurant has no floor
 * yet (fresh account) — the caller shows the "create or load" onboarding.
 */
export async function loadLayout(
  restaurantId: ID,
): Promise<LayoutSnapshot | null> {
  const [types, zones, tables, connections, obstacles] = await Promise.all([
    supabase.from('table_types').select('*').eq('restaurant_id', restaurantId),
    supabase.from('zones').select('*').eq('restaurant_id', restaurantId),
    supabase.from('tables').select('*').eq('restaurant_id', restaurantId),
    supabase
      .from('table_connections')
      .select('*')
      .eq('restaurant_id', restaurantId),
    supabase.from('obstacles').select('*').eq('restaurant_id', restaurantId),
  ])
  for (const r of [types, zones, tables, connections, obstacles]) {
    if (r.error) throw r.error
  }

  const empty =
    (zones.data?.length ?? 0) === 0 &&
    (tables.data?.length ?? 0) === 0 &&
    (types.data?.length ?? 0) === 0
  if (empty) return null

  return {
    tableTypes: (types.data as TableTypeRow[]).map(tableTypeFromRow),
    zones: (zones.data as ZoneRow[]).map(zoneFromRow),
    tables: (tables.data as TableRow[]).map(tableFromRow),
    mergedGroups: (connections.data as ConnectionRow[]).map(connectionFromRow),
    obstacles: (obstacles.data as ObstacleRow[]).map(obstacleFromRow),
  }
}

/**
 * Replace a restaurant's whole layout transactionally (delete + insert in one
 * RPC). Used by the editor autosave; last write wins.
 */
export async function saveLayout(
  restaurantId: ID,
  snapshot: LayoutSnapshot,
): Promise<void> {
  const { error } = await supabase.rpc('replace_layout', {
    p_restaurant_id: restaurantId,
    p_table_types: (snapshot.tableTypes ?? []).map(tableTypeToRow),
    p_zones: snapshot.zones.map(zoneToRow),
    p_tables: snapshot.tables.map(tableToRow),
    p_connections: snapshot.mergedGroups.map(connectionToRow),
    p_obstacles: snapshot.obstacles.map(obstacleToRow),
  })
  if (error) throw error
}
