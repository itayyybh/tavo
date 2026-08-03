import { useEffect } from 'react'
import { useReservationStore, useSessionStore } from '@/stores'
import { supabase } from '@/services/supabase/client'
import { listReservations } from '@/services/supabase/reservationsRepo'
import { reservationFromRow, type ReservationRow } from '@/services/supabase/mappers'

/**
 * Tenant-scoped reservation persistence + realtime (Phase 9) — the DB-backed
 * replacement for the localStorage `useReservationPersistence`. Hydrates the
 * active restaurant's reservations, then streams inserts/updates/deletes from
 * every device on the account so the desktop reflects a phone booking without a
 * manual refresh. Lifted app-wide so the Floor and Reservations surfaces share
 * one live source.
 *
 * Realtime patches go through the store's local-only setters, so an echo of the
 * device's own write can't loop back to the database.
 */
export function useReservationSync() {
  const restaurantId = useSessionStore((s) => s.restaurantId)
  const ready = useSessionStore((s) => s.status === 'ready')

  useEffect(() => {
    if (!ready || !restaurantId) {
      // Signed out / between restaurants — don't leak the previous tenant's data.
      useReservationStore.getState().replaceAll([])
      return
    }

    let cancelled = false
    listReservations(restaurantId)
      .then((rows) => {
        if (!cancelled) useReservationStore.getState().replaceAll(rows)
      })
      .catch((err) => console.error('Reservation load failed', err))

    const channel = supabase
      .channel(`reservations:${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const store = useReservationStore.getState()
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string }).id
            if (id) store.removeLocal(id)
            return
          }
          store.upsertLocal(reservationFromRow(payload.new as ReservationRow))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [restaurantId, ready])
}
