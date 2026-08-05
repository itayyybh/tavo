import { useEffect } from 'react'
import { useFloorStore, useSessionStore } from '@/stores'
import { supabase } from '@/services/supabase/client'
import {
  loadFloor,
  saveFloor,
  snapshotFromRow,
  type FloorRow,
} from '@/services/supabase/floorRepo'
import type { FloorSnapshot } from '@/types'

const DEBOUNCE_MS = 500

/** An empty shift — no seatings, merges, or overrides. */
const EMPTY: FloorSnapshot = {
  seatings: [],
  runtimeMerges: [],
  statusOverrides: {},
  cleaningSince: {},
  positionOverrides: {},
  rotationOverrides: {},
}

const snapshotOf = (s: FloorSnapshot): FloorSnapshot => ({
  seatings: s.seatings,
  runtimeMerges: s.runtimeMerges,
  statusOverrides: s.statusOverrides,
  cleaningSince: s.cleaningSince,
  positionOverrides: s.positionOverrides,
  rotationOverrides: s.rotationOverrides,
})

// Module-level sync guards, shared across the hook's two effects:
//  * `applyingRemote` blocks the autosave listener while a remote snapshot is
//    being written into the store (replaceAll fires listeners synchronously).
//  * `lastJson` is the last snapshot we saved OR applied — used to drop our own
//    realtime echo and skip no-op writes.
let applyingRemote = false
let lastJson = ''

function applyRemote(snapshot: FloorSnapshot) {
  lastJson = JSON.stringify(snapshotOf(snapshot))
  applyingRemote = true
  useFloorStore.getState().replaceAll(snapshot)
  applyingRemote = false
}

/**
 * Tenant-scoped Live Floor sync (Phase 9) — the DB-backed replacement for
 * `useFloorPersistence`. The runtime shift layer is one document: hydrate it,
 * autosave changes (debounced — furniture drags are chatty), and stream remote
 * changes so seating a party on one device shows on another. Last write wins.
 */
export function useFloorSync() {
  const restaurantId = useSessionStore((s) => s.restaurantId)
  const ready = useSessionStore((s) => s.status === 'ready')

  // Hydrate + realtime.
  useEffect(() => {
    if (!ready || !restaurantId) {
      applyRemote(EMPTY) // don't leak the previous tenant's shift
      return
    }
    let cancelled = false
    loadFloor(restaurantId)
      .then((snapshot) => {
        if (!cancelled) applyRemote(snapshot ?? EMPTY)
      })
      .catch((err) => console.error('Floor load failed', err))

    const channel = supabase
      .channel(`floor:${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'floor_state',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') return
          const snapshot = snapshotFromRow(payload.new as unknown as FloorRow)
          // Drop our own echo / no-op updates.
          if (JSON.stringify(snapshot) === lastJson) return
          applyRemote(snapshot)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [restaurantId, ready])

  // Debounced autosave.
  useEffect(() => {
    if (!ready || !restaurantId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useFloorStore.subscribe((state) => {
      if (applyingRemote) return
      const snapshot = snapshotOf(state)
      const json = JSON.stringify(snapshot)
      if (json === lastJson) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        lastJson = json
        saveFloor(restaurantId, snapshot).catch((err) =>
          console.error('Floor save failed', err),
        )
      }, DEBOUNCE_MS)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [restaurantId, ready])
}
