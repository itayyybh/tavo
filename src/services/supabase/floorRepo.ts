import type { FloorSnapshot, ID, RuntimeMergedGroup, Seating, Vec2 } from '@/types'
import { supabase } from './client'

/**
 * Floor repository (Phase 9) — the tenant-scoped replacement for `floorStorage`.
 * The runtime shift layer is a single per-restaurant document: the inner objects
 * (seatings, merges, override maps) are already the app's own shapes, stored as
 * jsonb verbatim, so only the top-level column names are mapped here.
 */

export interface FloorRow {
  seatings: Seating[]
  runtime_merges: RuntimeMergedGroup[]
  status_overrides: FloorSnapshot['statusOverrides']
  cleaning_since: Record<ID, string>
  position_overrides: Record<ID, Vec2>
  rotation_overrides: Record<ID, number>
}

export function snapshotFromRow(row: FloorRow): FloorSnapshot {
  return {
    seatings: row.seatings ?? [],
    runtimeMerges: row.runtime_merges ?? [],
    statusOverrides: row.status_overrides ?? {},
    cleaningSince: row.cleaning_since ?? {},
    positionOverrides: row.position_overrides ?? {},
    rotationOverrides: row.rotation_overrides ?? {},
  }
}

/** Load the current shift's floor. Returns `null` when the restaurant has none. */
export async function loadFloor(restaurantId: ID): Promise<FloorSnapshot | null> {
  const { data, error } = await supabase
    .from('floor_state')
    .select(
      'seatings, runtime_merges, status_overrides, cleaning_since, position_overrides, rotation_overrides',
    )
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return snapshotFromRow(data as FloorRow)
}

/** Upsert the whole floor snapshot for a restaurant (last write wins). */
export async function saveFloor(
  restaurantId: ID,
  snapshot: FloorSnapshot,
): Promise<void> {
  const { error } = await supabase.from('floor_state').upsert(
    {
      restaurant_id: restaurantId,
      seatings: snapshot.seatings,
      runtime_merges: snapshot.runtimeMerges,
      status_overrides: snapshot.statusOverrides,
      cleaning_since: snapshot.cleaningSince,
      position_overrides: snapshot.positionOverrides,
      rotation_overrides: snapshot.rotationOverrides,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'restaurant_id' },
  )
  if (error) throw error
}
