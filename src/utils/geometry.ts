import type { Vec2 } from '@/types'
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
