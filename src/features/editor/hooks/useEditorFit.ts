import { useCallback } from 'react'
import { useLayoutStore, useUIStore } from '@/stores'
import { aabb, boundsOf, fitBounds } from '@/utils'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
/** Screen-space breathing room (px) kept around the content when fitting. */
const FIT_PADDING = 72

/**
 * Frame the editor's content (on-floor tables + zones) within the stage. Reads
 * the layout lazily via `getState` so the returned callback is stable. `size`
 * defaults to the store's stage size (toolbar button), but the canvas passes its
 * freshly-measured size to avoid racing the `setStageSize` commit on first open.
 */
export function useEditorFit() {
  const setViewport = useUIStore((s) => s.setViewport)
  return useCallback(
    (size?: { width: number; height: number }) => {
      const { tables, zones } = useLayoutStore.getState()
      const target = size ?? useUIStore.getState().stageSize
      const bounds = boundsOf([
        ...tables.filter((t) => !t.stored).map((t) => aabb(t.position, t.size)),
        ...zones.map((z) => aabb(z.position, z.size)),
      ])
      const next = fitBounds(bounds, target, {
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        padding: FIT_PADDING,
      })
      if (next) setViewport(next)
    },
    [setViewport],
  )
}
