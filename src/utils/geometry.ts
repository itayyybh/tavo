import type { Obstacle, Table, Vec2 } from '@/types'
import type { Viewport } from '@/stores/uiStore'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Round a value to the nearest grid increment. */
export function snap(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}

export function snapPoint(point: Vec2, gridSize: number): Vec2 {
  return { x: snap(point.x, gridSize), y: snap(point.y, gridSize) }
}

/** Convert a screen-space point (px within the stage) to world coordinates. */
export function screenToWorld(point: Vec2, viewport: Viewport): Vec2 {
  return {
    x: (point.x - viewport.pan.x) / viewport.zoom,
    y: (point.y - viewport.pan.y) / viewport.zoom,
  }
}

/** Convert a world point to screen-space (px within the stage). */
export function worldToScreen(point: Vec2, viewport: Viewport): Vec2 {
  return {
    x: point.x * viewport.zoom + viewport.pan.x,
    y: point.y * viewport.zoom + viewport.pan.y,
  }
}

/** True when a world-space point lies within an axis-aligned rect. */
export function pointInRect(
  point: Vec2,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/** Axis-aligned bounding box (top-left + size) from a centered element. */
export function aabb(center: Vec2, size: Vec2) {
  return {
    x: center.x - size.x / 2,
    y: center.y - size.y / 2,
    width: size.x,
    height: size.y,
  }
}

type Rect = { x: number; y: number; width: number; height: number }

/** Overlapping area of two axis-aligned rects (0 if they only touch or are apart). */
export function overlapArea(a: Rect, b: Rect): number {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return ox > 0 && oy > 0 ? ox * oy : 0
}

/** Overlap up to this fraction of a table's area is tolerated (edges/slight touch ok). */
export const OVERLAP_TOLERANCE = 0.1

/**
 * Does a rect overlap a freehand path obstacle's lane? Samples the stroke
 * centerline and tests each sample against the rect expanded by the lane's
 * half-width.
 */
export function pathBlocksRect(o: Obstacle, box: Rect): boolean {
  if (!o.points?.length) return false
  const r = (o.brushWidth ?? 0) / 2
  const ex = { x: box.x - r, y: box.y - r, width: box.width + 2 * r, height: box.height + 2 * r }
  const pts = o.points.map((p) => ({ x: p.x + o.position.x, y: p.y + o.position.y }))
  const step = Math.max(4, r)
  for (let i = 0; i < pts.length; i++) {
    if (pointInRect(pts[i], ex)) return true
    if (i > 0) {
      const a = pts[i - 1]
      const b = pts[i]
      const segLen = Math.hypot(b.x - a.x, b.y - a.y)
      const n = Math.ceil(segLen / step)
      for (let k = 1; k < n; k++) {
        const t = k / n
        if (pointInRect({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, ex))
          return true
      }
    }
  }
  return false
}

/**
 * Would placing a box here overlap another table or a wall/path obstacle by
 * more than a tolerated sliver? Shared by drag/resize placement and merge
 * auto-placement so both use the same "too much overlap" definition.
 */
export function boxBlocked(
  box: Rect,
  tables: Table[],
  obstacles: Obstacle[],
  ignoreTableIds: Set<string>,
): boolean {
  const limit = box.width * box.height * OVERLAP_TOLERANCE
  const hitsWall = obstacles.some((o) =>
    o.kind === 'path' && o.points?.length
      ? pathBlocksRect(o, box)
      : overlapArea(box, aabb(o.position, o.size)) > limit,
  )
  const hitsTable = tables.some(
    (t) => !ignoreTableIds.has(t.id) && overlapArea(box, aabb(t.position, t.size)) > limit,
  )
  return hitsWall || hitsTable
}
