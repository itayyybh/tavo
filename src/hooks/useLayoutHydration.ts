import { useEffect } from 'react'
import { useLayoutStore } from '@/stores'
import { loadLayout } from '@/services/layoutStorage'

/**
 * Hydrate the layout document from storage once, app-wide.
 *
 * Zones and tables are shared domain config — the Floor and Reservations
 * surfaces read them too, not just the Editor. Lifting the *read* here means
 * every route sees the real layout instead of the in-memory defaults. Writing
 * (autosave) stays editor-only, so no surface outside the Editor mutates it.
 */
export function useLayoutHydration() {
  useEffect(() => {
    const saved = loadLayout()
    if (saved) useLayoutStore.getState().loadSnapshot(saved)
  }, [])
}
