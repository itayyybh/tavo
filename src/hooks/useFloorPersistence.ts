import { useEffect } from 'react'
import { useFloorStore } from '@/stores'
import { loadFloor, saveFloor } from '@/services/floorStorage'

const DEBOUNCE_MS = 500

/**
 * Hydrate the Live Floor's runtime override layer from storage once on mount,
 * then debounced-save on any change. Mirrors the layout/reservation persistence
 * split (service + hook) so persistence stays out of the store.
 *
 * Lifted app-wide (like `useLayoutHydration`): seating a party moves a
 * reservation to `seated`, so the current shift must survive a refresh no matter
 * which surface is open.
 */
export function useFloorPersistence() {
  // Hydrate once.
  useEffect(() => {
    const stored = loadFloor()
    if (stored) useFloorStore.getState().replaceAll(stored)
  }, [])

  // Debounced autosave of the raw override layer.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useFloorStore.subscribe((state) => {
      clearTimeout(timer)
      timer = setTimeout(
        () =>
          saveFloor({
            seatings: state.seatings,
            runtimeMerges: state.runtimeMerges,
            statusOverrides: state.statusOverrides,
            positionOverrides: state.positionOverrides,
          }),
        DEBOUNCE_MS,
      )
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [])
}
