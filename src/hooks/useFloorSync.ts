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

/**
 * Order-independent JSON key for a snapshot. Postgres `jsonb` does NOT preserve
 * object key order, so a snapshot we saved comes back through realtime with keys
 * reordered — a raw `JSON.stringify` compare would treat our own echo as a fresh
 * remote change and re-apply it. That re-application is what made undo "bounce
 * back": a stale echo re-merged the floor a beat after the host undid. Sorting
 * keys recursively makes the echo compare equal, so it's dropped. Array order
 * (seatings, tableIds) is meaningful and left untouched.
 */
export function stableKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj)
      .sort()
      // Drop undefined-valued keys — JSON (and thus the jsonb round-trip) omits
      // them, so a local `seatingId: undefined` must compare equal to an echo
      // that lacks the key entirely.
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableKey(obj[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

// Module-level sync guards, shared across the hook's two effects:
//  * `applyingRemote` blocks the autosave listener while a remote snapshot is
//    being written into the store (replaceAll fires listeners synchronously).
//  * `lastJson` is the last snapshot we saved OR applied — used to drop our own
//    realtime echo and skip no-op writes.
let applyingRemote = false
let lastJson = ''

function applyRemote(snapshot: FloorSnapshot) {
  lastJson = stableKey(snapshotOf(snapshot))
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
          // Drop our own echo / no-op updates (key-order-independent — jsonb
          // round-trips reorder keys).
          if (stableKey(snapshot) === lastJson) return
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
      const json = stableKey(snapshot)
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
