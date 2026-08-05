import { useCallback, useState } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { clamp, screenToWorld } from '@/utils'
import type { Viewport } from '@/stores/uiStore'

const MIN_ZOOM = 0.2
const MAX_ZOOM = 4
const ZOOM_STEP = 1.05
/** Screen-space breathing room (px) kept around the content when fitting. */
const FIT_PADDING = 72

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface FloorCamera {
  viewport: Viewport
  /** Wheel zoom, anchored at the cursor. */
  handleWheel: (e: KonvaEventObject<WheelEvent>) => void
  /** Commit the pan after a stage drag. */
  commitPan: (pan: Viewport['pan']) => void
  /** Frame the given world bounds within a screen of `size`. No-op on empty input. */
  fit: (bounds: Bounds | null, size: { width: number; height: number }) => void
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

  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      const pointer = stageRef.current?.getPointerPosition()
      if (!pointer) return
      setViewport((prev) => {
        const factor = e.evt.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
        const zoom = clamp(prev.zoom * factor, MIN_ZOOM, MAX_ZOOM)
        const world = screenToWorld(pointer, prev)
        return {
          zoom,
          pan: { x: pointer.x - world.x * zoom, y: pointer.y - world.y * zoom },
        }
      })
    },
    [stageRef],
  )

  const commitPan = useCallback((pan: Viewport['pan']) => {
    setViewport((prev) => ({ ...prev, pan }))
  }, [])

  const fit = useCallback(
    (bounds: Bounds | null, size: { width: number; height: number }) => {
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return
      if (size.width <= 0 || size.height <= 0) return
      const zoom = clamp(
        Math.min(
          (size.width - FIT_PADDING * 2) / bounds.width,
          (size.height - FIT_PADDING * 2) / bounds.height,
        ),
        MIN_ZOOM,
        MAX_ZOOM,
      )
      const cx = bounds.x + bounds.width / 2
      const cy = bounds.y + bounds.height / 2
      setViewport({
        zoom,
        pan: { x: size.width / 2 - cx * zoom, y: size.height / 2 - cy * zoom },
      })
    },
    [],
  )

  return { viewport, handleWheel, commitPan, fit }
}
