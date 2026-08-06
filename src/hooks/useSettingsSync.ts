import { useEffect } from 'react'
import { persistableConfig, useSettingsStore, useSessionStore } from '@/stores'
import { loadSettings, saveSettings } from '@/services/supabase/settingsRepo'

const DEBOUNCE_MS = 600

/**
 * Tenant-scoped settings persistence (Phase 11) — loads the restaurant's saved
 * settings on sign-in, then autosaves every change back. Mirrors `useLayoutSync`:
 * autosave is gated on `hydrated` so the pre-hydration defaults never overwrite
 * a saved config. No realtime — settings change rarely, load-on-mount is enough.
 *
 * `locale` is intentionally left out (per-user, kept in localStorage); only the
 * `persistableConfig` slice round-trips to the database.
 */
export function useSettingsSync() {
  const restaurantId = useSessionStore((s) => s.restaurantId)
  const ready = useSessionStore((s) => s.status === 'ready')

  // Hydrate whenever the active restaurant changes.
  useEffect(() => {
    if (!ready || !restaurantId) return
    let cancelled = false
    useSettingsStore.getState().setHydrated(false)
    loadSettings(restaurantId)
      .then((config) => {
        if (cancelled) return
        if (config) useSettingsStore.getState().loadConfig(config)
        useSettingsStore.getState().setHydrated(true)
      })
      .catch((err) => {
        console.error('Settings load failed', err)
        if (!cancelled) useSettingsStore.getState().setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [restaurantId, ready])

  // Debounced autosave, only after settings are hydrated.
  useEffect(() => {
    if (!ready || !restaurantId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useSettingsStore.subscribe((state) => {
      if (!state.hydrated) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        saveSettings(restaurantId, persistableConfig(state)).catch((err) =>
          console.error('Settings save failed', err),
        )
      }, DEBOUNCE_MS)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [restaurantId, ready])
}
