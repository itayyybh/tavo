import { useEffect } from 'react'
import { useReservationStore } from '@/stores'
import { loadReservations, saveReservations } from '@/services/reservationStorage'

const DEBOUNCE_MS = 500

/**
 * Hydrate reservations from storage once on mount, then debounced-save on any
 * change. Mirrors the layout autosave split (service + hook), so persistence
 * stays out of the store itself.
 */
export function useReservationPersistence() {
  // Hydrate once.
  useEffect(() => {
    const stored = loadReservations()
    if (stored) useReservationStore.getState().replaceAll(stored)
  }, [])

  // Debounced autosave.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useReservationStore.subscribe((state) => {
      clearTimeout(timer)
      timer = setTimeout(() => saveReservations(state.reservations), DEBOUNCE_MS)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [])
}
