import { useEffect } from 'react'
import { useLayoutStore } from '@/stores'
import { saveLayout } from '@/services/layoutStorage'

const DEBOUNCE_MS = 500

/** Debounced autosave of the layout document to storage on any change. */
export function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const unsubscribe = useLayoutStore.subscribe((state) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        saveLayout({
          tables: state.tables,
          zones: state.zones,
          mergedGroups: state.mergedGroups,
          obstacles: state.obstacles,
        })
      }, DEBOUNCE_MS)
    })

    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [])
}
