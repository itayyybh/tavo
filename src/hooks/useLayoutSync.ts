import { useEffect } from 'react'
import { useLayoutStore, useSessionStore } from '@/stores'
import { loadLayout, saveLayout } from '@/services/supabase/layoutRepo'
import type { LayoutSnapshot } from '@/types'

const DEBOUNCE_MS = 600

/** An empty floor — a fresh restaurant with no layout yet. */
const EMPTY_LAYOUT: LayoutSnapshot = {
  tables: [],
  zones: [],
  mergedGroups: [],
  obstacles: [],
}

/**
 * Tenant-scoped layout persistence (Phase 9) — the DB-backed replacement for
 * `useLayoutHydration` + the editor autosave. Loads the current restaurant's
 * floor from the database; a fresh restaurant loads empty (the onboarding
 * prompt takes over). After hydration, every layout change autosaves back.
 *
 * Autosave is gated on `hydrated` so the pre-hydration seed defaults never
 * overwrite a real (or intentionally empty) floor.
 */
export function useLayoutSync() {
  const restaurantId = useSessionStore((s) => s.restaurantId)
  const ready = useSessionStore((s) => s.status === 'ready')

  // Hydrate whenever the active restaurant changes.
  useEffect(() => {
    if (!ready || !restaurantId) return
    let cancelled = false
    useLayoutStore.getState().setHydrated(false)
    loadLayout(restaurantId)
      .then((snapshot) => {
        if (cancelled) return
        useLayoutStore.getState().loadSnapshot(snapshot ?? EMPTY_LAYOUT)
        useLayoutStore.getState().setHydrated(true)
      })
      .catch((err) => {
        console.error('Layout load failed', err)
        if (!cancelled) useLayoutStore.getState().setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [restaurantId, ready])

  // Debounced autosave, only after the floor is hydrated.
  useEffect(() => {
    if (!ready || !restaurantId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useLayoutStore.subscribe((state) => {
      if (!state.hydrated) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        saveLayout(restaurantId, {
          tables: state.tables,
          zones: state.zones,
          mergedGroups: state.mergedGroups,
          obstacles: state.obstacles,
          tableTypes: state.tableTypes,
        }).catch((err) => console.error('Layout save failed', err))
      }, DEBOUNCE_MS)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [restaurantId, ready])
}
