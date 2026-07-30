/**
 * Zone hierarchy helpers (see the `data-model` skill).
 * Zones form a folder-like tree via `parentId`; tables resolve to the innermost
 * containing zone, and nested zones act as no-go regions for outside tables.
 */
import type { ID, Table, Vec2, Zone } from '@/types'
import { aabb, pointInRect } from './geometry'

/** Index zones by id for O(1) parent lookups. */
export function zonesById(zones: Zone[]): Map<ID, Zone> {
  return new Map(zones.map((z) => [z.id, z]))
}

/** Count tables assigned to each zone id. Used as a zone's reservation capacity. */
export function countTablesByZone(tables: Table[]): Map<ID, number> {
  const counts = new Map<ID, number>()
  for (const t of tables) {
    if (!t.zoneId) continue
    counts.set(t.zoneId, (counts.get(t.zoneId) ?? 0) + 1)
  }
  return counts
}

/** Depth from the root (root zone = 0). Cycle-safe. */
export function zoneDepth(zone: Zone, byId: Map<ID, Zone>): number {
  let depth = 0
  const seen = new Set<ID>([zone.id])
  let parentId = zone.parentId
  while (parentId && byId.has(parentId) && !seen.has(parentId)) {
    seen.add(parentId)
    depth += 1
    parentId = byId.get(parentId)!.parentId
  }
  return depth
}

/** Ancestor ids from nearest parent up to the root. Cycle-safe. */
export function zoneAncestorIds(zoneId: ID, byId: Map<ID, Zone>): ID[] {
  const out: ID[] = []
  const seen = new Set<ID>([zoneId])
  let parentId = byId.get(zoneId)?.parentId
  while (parentId && byId.has(parentId) && !seen.has(parentId)) {
    seen.add(parentId)
    out.push(parentId)
    parentId = byId.get(parentId)!.parentId
  }
  return out
}

/** All descendant ids of a zone (its whole subtree, excluding itself). */
export function zoneDescendantIds(zoneId: ID, zones: Zone[]): ID[] {
  const childrenByParent = new Map<ID, ID[]>()
  for (const z of zones) {
    if (!z.parentId) continue
    const arr = childrenByParent.get(z.parentId) ?? []
    arr.push(z.id)
    childrenByParent.set(z.parentId, arr)
  }
  const out: ID[] = []
  const stack = [...(childrenByParent.get(zoneId) ?? [])]
  while (stack.length) {
    const id = stack.pop()!
    out.push(id)
    stack.push(...(childrenByParent.get(id) ?? []))
  }
  return out
}

/**
 * The innermost zone whose AABB contains a point: deepest in the tree wins,
 * tie-broken by smallest footprint. '' if the point is inside no zone.
 */
export function innermostZoneAt(point: Vec2, zones: Zone[], byId: Map<ID, Zone>): ID {
  let bestId = ''
  let bestDepth = -1
  let bestArea = Infinity
  for (const z of zones) {
    if (!pointInRect(point, aabb(z.position, z.size))) continue
    const depth = zoneDepth(z, byId)
    const area = z.size.x * z.size.y
    if (depth > bestDepth || (depth === bestDepth && area < bestArea)) {
      bestId = z.id
      bestDepth = depth
      bestArea = area
    }
  }
  return bestId
}

/**
 * Derive each zone's parent purely from geometry: the smallest zone that is
 * strictly bigger and fully contains it becomes its parent (a small epsilon
 * tolerates touching edges). This is how nesting is established on the grid —
 * draw/drag a smaller area inside a bigger one and it auto-nests.
 */
export function deriveZoneParents(zones: Zone[]): Zone[] {
  const EPS = 2
  const boxes = zones.map((z) => ({
    id: z.id,
    box: aabb(z.position, z.size),
    area: z.size.x * z.size.y,
  }))
  return zones.map((z) => {
    const zb = aabb(z.position, z.size)
    const za = z.size.x * z.size.y
    let parentId: ID | undefined
    let bestArea = Infinity
    for (const p of boxes) {
      if (p.id === z.id) continue
      if (p.area <= za) continue // parent must be strictly bigger (breaks ties/cycles)
      const contains =
        p.box.x - EPS <= zb.x &&
        p.box.y - EPS <= zb.y &&
        p.box.x + p.box.width + EPS >= zb.x + zb.width &&
        p.box.y + p.box.height + EPS >= zb.y + zb.height
      if (contains && p.area < bestArea) {
        parentId = p.id
        bestArea = p.area
      }
    }
    return z.parentId === parentId ? z : { ...z, parentId }
  })
}
