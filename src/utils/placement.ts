import type { ID, Obstacle, Table, Vec2, Zone } from '@/types'
import { aabb, boxBlocked, OVERLAP_TOLERANCE, overlapArea } from './geometry'
import { innermostZoneAt, zoneAncestorIds } from './zones'

/**
 * Everything a placement test needs about the floor, independent of which store
 * the tables come from. The editor builds it from `layoutStore` (design-time
 * truth); the Live Floor builds it from the effective `floorStore` snapshot
 * (base + runtime overrides). One context type → one placement definition for
 * both surfaces.
 */
export interface PlacementContext {
  tables: Table[]
  obstacles: Obstacle[]
  zones: Zone[]
  /** `zonesById(zones)` — passed in so callers can memoize it. */
  zonesIndex: Map<ID, Zone>
  /** A table's chair-clearance halo (merged-group override wins). */
  clearanceOf: (t: Table) => number
}

/**
 * Would placing a box (center + size) here be an illegal spot? Two ways to fail,
 * beyond a small tolerance:
 * - it overlaps another table's body+clearance, or a wall/path/object body
 *   (`boxBlocked`); or
 * - it intrudes into a nested zone it doesn't belong to (a table may only enter
 *   its own innermost zone or an ancestor of it).
 *
 * The single placement gate shared by the editor and the Live Floor so both use
 * one definition of a legal spot. `ignore` skips tables that move together;
 * `boxClearance` is the moving box's own halo (counted against other tables only).
 */
export function placementBlocked(
  center: Vec2,
  size: Vec2,
  ignore: Set<string>,
  ctx: PlacementContext,
  boxClearance = 0,
): boolean {
  const box = aabb(center, size)
  if (boxBlocked(box, ctx.tables, ctx.obstacles, ignore, ctx.clearanceOf, boxClearance)) {
    return true
  }
  // Nested zones are no-go regions: a table may only intrude into a child zone
  // it belongs to (its innermost zone, by center) or an ancestor of it.
  const limit = size.x * size.y * OVERLAP_TOLERANCE
  const ownZone = innermostZoneAt(center, ctx.zones, ctx.zonesIndex)
  const allowed = new Set<string>([ownZone, ...zoneAncestorIds(ownZone, ctx.zonesIndex)])
  return ctx.zones.some(
    (z) =>
      z.parentId &&
      !allowed.has(z.id) &&
      overlapArea(box, aabb(z.position, z.size)) > limit,
  )
}
