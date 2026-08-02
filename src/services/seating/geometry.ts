/**
 * Geometric primitives for the Seating Engine (Phase 7).
 *
 * Builds on the shared axis-aligned helpers in `src/utils/geometry.ts`. Like the
 * rest of the app's placement/merge logic, tables are treated as axis-aligned
 * boxes (rotation is ignored for footprint math) so seating stays consistent
 * with how the editor snaps and blocks tables.
 *
 * Adjacency and distance here feed the SOFT proximity preference in the scorer —
 * they are never hard gates. Tables may merge from anywhere in the same zone.
 */
import type { Table, Vec2 } from '@/types'
import { aabb } from '@/utils'

type Rect = { x: number; y: number; width: number; height: number }

/** Default slack (world units) allowed between two tables still counted adjacent. */
export const ADJACENCY_GAP = 8

/** A table's axis-aligned footprint (top-left + size) in world space. */
export function tableFootprint(table: Table): Rect {
  return aabb(table.position, table.size)
}

/** Straight-line distance between two tables' centers. Feeds proximity scoring. */
export function centerDistance(a: Table, b: Table): number {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)
}

/** Do two rects overlap or touch (shared edge counts)? */
function intersectsOrTouches(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  )
}

/** Expand a rect equally on all sides. */
function grow(box: Rect, by: number): Rect {
  return { x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 }
}

/**
 * Are two tables physically close enough to sit side by side? Their footprints
 * touch (or nearly touch, within `gap`). Soft signal for the scorer — NOT a
 * merge gate.
 */
export function areAdjacent(a: Table, b: Table, gap: number = ADJACENCY_GAP): boolean {
  return intersectsOrTouches(grow(tableFootprint(a), gap / 2), tableFootprint(b))
}

/** Combined axis-aligned bounding box of several tables. Undefined if empty. */
export function boundingBoxOf(tables: Table[]): Rect | undefined {
  if (tables.length === 0) return undefined
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const t of tables) {
    const box = tableFootprint(t)
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.width)
    maxY = Math.max(maxY, box.y + box.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Geometric center of a set of tables (mean of centers). Undefined if empty. */
export function centroidOf(tables: Table[]): Vec2 | undefined {
  if (tables.length === 0) return undefined
  const sum = tables.reduce(
    (acc, t) => ({ x: acc.x + t.position.x, y: acc.y + t.position.y }),
    { x: 0, y: 0 },
  )
  return { x: sum.x / tables.length, y: sum.y / tables.length }
}
