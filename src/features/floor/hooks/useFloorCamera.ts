import { useCallback, useRef, useState } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { clamp, clampPan, fitBounds, screenToWorld, type Bounds } from '@/utils'
import type { Vec2 } from '@/types'
import type { Viewport } from '@/stores/uiStore'

const MIN_ZOOM = 0.2
const MAX_ZOOM = 4
const ZOOM_STEP = 1.05
/** Screen-space breathing room (px) kept around the content when fitting. */
const FIT_PADDING = 72

export type { Bounds }

interface Frame {
  bounds: Bounds | null
  size: { width: number; height: number }
}

export interface FloorCamera {
  viewport: Viewport
  /** Wheel zoom, anchored at the cursor. */
  handleWheel: (e: KonvaEventObject<WheelEvent>) => void
  /** Commit the pan after a stage drag. */
  commitPan: (pan: Viewport['pan']) => void
  /** Set the whole camera at once (zoom + pan) — used by pinch-zoom. */
  setCamera: (viewport: Viewport) => void
  /** Frame the given world bounds within a screen of `size`. No-op on empty input. */
  fit: (bounds: Bounds | null, size: { width: number; height: number }) => void
  /** Feed the current content bounds + stage size so pan can be kept in-bounds. */
  setFrame: (bounds: Bounds | null, size: { width: number; height: number }) => void
  /** Stage `dragBoundFunc`: clamp a live drag-pan to the content bounds. */
  dragBound: (pos: Vec2) => Vec2
}

/**
 * Read-only camera for the Live Floor: wheel-zoom-to-cursor, drag-to-pan, and
 * fit-to-content. Deliberately its OWN local state (not the editor's global
 * `uiStore.viewport`) so framing the floor never clobbers the editor's camera.
 */
export function useFloorCamera(
  stageRef: React.RefObject<Konva.Stage | null>,
): FloorCamera {
  const [viewport, setViewport] = useState<Viewport>({ pan: { x: 0, y: 0 }, zoom: 1 })
  const frameRef = useRef<Frame>({ bounds: null, size: { width: 0, height: 0 } })

  // How much content must stay on-screen at the pan extremes: half the smaller
  // viewport dimension, so any edge table can still be pulled to mid-screen while
  // the floor can never be scrolled entirely out of view.
  const panMargin = (size: { width: number; height: number }) =>
    Math.min(size.width, size.height) / 2

  const boundPan = useCallback((pan: Vec2, zoom: number): Vec2 => {
    const { bounds, size } = frameRef.current
    return clampPan(pan, bounds, size, zoom, panMargin(size))
  }, [])

  const setFrame = useCallback(
    (bounds: Bounds | null, size: { width: number; height: number }) => {
      frameRef.current = { bounds, size }
    },
    [],
  )

  const dragBound = useCallback(
    (pos: Vec2) => boundPan(pos, viewport.zoom),
    [boundPan, viewport.zoom],
  )

  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      const pointer = stageRef.current?.getPointerPosition()
      if (!pointer) return
      setViewport((prev) => {
        // Match the editor: a pinch (trackpad) or ctrl+wheel zooms at the cursor;
        // a plain two-finger scroll pans. So the host can move around the floor by
        // scrolling, not only zoom.
        if (e.evt.ctrlKey) {
          const factor = e.evt.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
          const zoom = clamp(prev.zoom * factor, MIN_ZOOM, MAX_ZOOM)
          const world = screenToWorld(pointer, prev)
          const pan = { x: pointer.x - world.x * zoom, y: pointer.y - world.y * zoom }
          return { zoom, pan: boundPan(pan, zoom) }
        }
        const pan = { x: prev.pan.x - e.evt.deltaX, y: prev.pan.y - e.evt.deltaY }
        return { zoom: prev.zoom, pan: boundPan(pan, prev.zoom) }
      })
    },
    [stageRef, boundPan],
  )

  const commitPan = useCallback(
    (pan: Viewport['pan']) => {
      setViewport((prev) => ({ ...prev, pan: boundPan(pan, prev.zoom) }))
    },
    [boundPan],
  )

  const setCamera = useCallback(
    (next: Viewport) => setViewport({ ...next, pan: boundPan(next.pan, next.zoom) }),
    [boundPan],
  )

  const fit = useCallback(
    (bounds: Bounds | null, size: { width: number; height: number }) => {
      const next = fitBounds(bounds, size, {
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        padding: FIT_PADDING,
      })
      if (next) setViewport(next)
    },
    [],
  )

  return { viewport, handleWheel, commitPan, setCamera, fit, setFrame, dragBound }
}
