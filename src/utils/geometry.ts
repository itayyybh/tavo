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

export type Bounds = Rect

/** Union AABB of a set of rects, or null if empty. */
export function boundsOf(rects: Rect[]): Bounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  if (minX === Infinity) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Clamp a camera pan so the content `bounds` can't be dragged off into empty
 * space forever. `margin` is how much content (screen px) must stay on-screen at
 * the extremes — panning stops once the far content edge is `margin` px from the
 * opposite viewport edge. Falls back to free pan when there's no content.
 */
export function clampPan(
  pan: Vec2,
  bounds: Bounds | null,
  size: { width: number; height: number },
  zoom: number,
  margin: number,
): Vec2 {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return pan
  const minX = margin - (bounds.x + bounds.width) * zoom
  const maxX = size.width - margin - bounds.x * zoom
  const minY = margin - (bounds.y + bounds.height) * zoom
  const maxY = size.height - margin - bounds.y * zoom
  return {
    // When content is smaller than the viewport the bounds invert; ordering the
    // limits keeps a valid (if looser) range either way.
    x: clamp(pan.x, Math.min(minX, maxX), Math.max(minX, maxX)),
    y: clamp(pan.y, Math.min(minY, maxY), Math.max(minY, maxY)),
  }
}

export interface FitOptions {
  minZoom: number
  maxZoom: number
  /** Screen-space breathing room (px) kept around the content. */
  padding: number
}

/**
 * Frame `bounds` centered within a screen of `size`: the zoom that fits the
 * content (clamped) plus the pan that centers it. Returns null on empty/zero
 * input so callers can no-op. Shared by the editor and Live Floor cameras.
 */
export function fitBounds(
  bounds: Bounds | null,
  size: { width: number; height: number },
  { minZoom, maxZoom, padding }: FitOptions,
): Viewport | null {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
  if (size.width <= 0 || size.height <= 0) return null
  const zoom = clamp(
    Math.min(
      (size.width - padding * 2) / bounds.width,
      (size.height - padding * 2) / bounds.height,
    ),
    minZoom,
    maxZoom,
  )
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  return {
    zoom,
    pan: { x: size.width / 2 - cx * zoom, y: size.height / 2 - cy * zoom },
  }
}

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
  const ex = {
    x: box.x - r,
    y: box.y - r,
    width: box.width + 2 * r,
    height: box.height + 2 * r,
  }
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
function grow(box: Rect, by: number): Rect {
  return by
    ? {
        x: box.x - by,
        y: box.y - by,
        width: box.width + by * 2,
        height: box.height + by * 2,
      }
    : box
}

export function boxBlocked(
  box: Rect,
  tables: Table[],
  obstacles: Obstacle[],
  ignoreTableIds: Set<string>,
  // Chair-clearance counts as solid ONLY between tables: the moving box grows by
  // `boxClearance` and each other table by `clearanceOf(t)`, so neither body
  // enters the other's dotted ring (the rings never overlap). Walls, paths, and
  // objects use the raw body — a table may push its chair space against them.
  clearanceOf?: (t: Table) => number,
  boxClearance = 0,
): boolean {
  const limit = box.width * box.height * OVERLAP_TOLERANCE
  const hitsWall = obstacles.some((o) =>
    o.kind === 'path' && o.points?.length
      ? pathBlocksRect(o, box)
      : overlapArea(box, aabb(o.position, o.size)) > limit,
  )
  const grown = grow(box, boxClearance)
  const grownLimit = grown.width * grown.height * OVERLAP_TOLERANCE
  const hitsTable = tables.some((t) => {
    if (ignoreTableIds.has(t.id)) return false
    const tbox = grow(aabb(t.position, t.size), clearanceOf?.(t) ?? 0)
    return overlapArea(grown, tbox) > grownLimit
  })
  return hitsWall || hitsTable
}
