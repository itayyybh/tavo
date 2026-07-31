import { create } from 'zustand'
import type {
  FloorSnapshot,
  ID,
  RuntimeMergedGroup,
  Seating,
  Vec2,
} from '@/types'
import { createId } from '@/utils'
import { useReservationStore } from './reservationStore'

/**
 * Floor Store (Phase 8) — the runtime override layer for the CURRENT shift.
 *
 * It records only what this shift changed on top of the base layout: who's
 * seated, which tables staff pushed together or moved, and manual runtime status
 * (cleaning after turnover, host-blocked). The base design lives in `layoutStore`
 * and this store NEVER mutates it — `deriveFloorState` combines the two into the
 * effective floor the host sees (`effectiveTable = base + liveOverride`).
 *
 * As guests are physically seated and cleared, the high-level `seat`/`clear`
 * actions also drive the reservation lifecycle (`arrived → seated → completed`)
 * via the reservation store — the one place the operational floor coordinates the
 * two engines. It reads the reservation store; the reservation store never reads
 * back, so there is no cycle.
 */

/** The only host-settable runtime statuses (occupancy is derived, not stored). */
export type ManualFloorStatus = 'cleaning' | 'blocked'

interface FloorState extends FloorSnapshot {
  /**
   * Seat a party: create a seating over `tableIds`, form a runtime merge when it
   * spans several tables, clear any stale status override on those tables, and
   * move the reservation to `seated`.
   */
  seat: (reservationId: ID, tableIds: ID[]) => void
  /**
   * Clear a seated party: drop the seating, flag its runtime merge unowned (the
   * tables stay pushed together), put the tables into `cleaning`, and move the
   * reservation to `completed`.
   */
  clear: (seatingId: ID) => void
  /** Finish turnover — remove the `cleaning` override so the table reads available. */
  finishCleaning: (tableId: ID) => void
  /** Set (or clear, with `undefined`) a manual runtime status override for a table. */
  setTableStatus: (tableId: ID, status: ManualFloorStatus | undefined) => void
  /** Record a runtime position for a table staff physically moved. */
  moveTable: (tableId: ID, position: Vec2) => void
  /** Merge tables for this shift. `seatingId` owns the merge (undefined = unowned). */
  mergeRuntime: (tableIds: ID[], seatingId?: ID) => RuntimeMergedGroup
  /** Split a runtime merge. */
  splitRuntime: (mergeId: ID) => void
  /**
   * Restore the base layout: reset all furniture back to base positions, dissolve
   * unowned runtime merges, and end pending turnovers (`cleaning` cleared). Active
   * seatings, their owned merges, and host `blocked` marks are left untouched.
   */
  restoreDefault: () => void
  /** Replace the whole runtime layer — used to hydrate from storage. */
  replaceAll: (snapshot: FloorSnapshot) => void
}

const now = () => new Date().toISOString()

/** Remove one key from a record without mutating the original. */
function omit<V>(record: Record<ID, V>, key: ID): Record<ID, V> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

export const useFloorStore = create<FloorState>((set, get) => ({
  seatings: [],
  runtimeMerges: [],
  statusOverrides: {},
  positionOverrides: {},

  seat: (reservationId, tableIds) => {
    if (tableIds.length === 0) return
    const seating: Seating = {
      id: createId(),
      reservationId,
      tableIds: [...tableIds].sort(),
      seatedAt: now(),
    }
    set((state) => {
      // Seating occupies the tables — drop any stale cleaning/blocked override.
      let statusOverrides = state.statusOverrides
      for (const id of seating.tableIds) statusOverrides = omit(statusOverrides, id)

      const runtimeMerges =
        seating.tableIds.length > 1
          ? [
              ...state.runtimeMerges,
              { id: createId(), tableIds: seating.tableIds, seatingId: seating.id },
            ]
          : state.runtimeMerges

      return { seatings: [...state.seatings, seating], runtimeMerges, statusOverrides }
    })
    useReservationStore.getState().setStatus(reservationId, 'seated')
  },

  clear: (seatingId) => {
    const seating = get().seatings.find((s) => s.id === seatingId)
    if (!seating) return
    set((state) => {
      // Tables enter turnover; the merge stays but becomes unowned.
      const statusOverrides = { ...state.statusOverrides }
      for (const id of seating.tableIds) statusOverrides[id] = 'cleaning'

      return {
        seatings: state.seatings.filter((s) => s.id !== seatingId),
        runtimeMerges: state.runtimeMerges.map((m) =>
          m.seatingId === seatingId ? { ...m, seatingId: undefined } : m,
        ),
        statusOverrides,
      }
    })
    useReservationStore.getState().setStatus(seating.reservationId, 'completed')
  },

  finishCleaning: (tableId) =>
    set((state) =>
      state.statusOverrides[tableId] === 'cleaning'
        ? { statusOverrides: omit(state.statusOverrides, tableId) }
        : state,
    ),

  setTableStatus: (tableId, status) =>
    set((state) => ({
      statusOverrides:
        status === undefined
          ? omit(state.statusOverrides, tableId)
          : { ...state.statusOverrides, [tableId]: status },
    })),

  moveTable: (tableId, position) =>
    set((state) => ({
      positionOverrides: { ...state.positionOverrides, [tableId]: position },
    })),

  mergeRuntime: (tableIds, seatingId) => {
    const group: RuntimeMergedGroup = {
      id: createId(),
      tableIds: [...tableIds].sort(),
      seatingId,
    }
    set((state) => ({ runtimeMerges: [...state.runtimeMerges, group] }))
    return group
  },

  splitRuntime: (mergeId) =>
    set((state) => ({
      runtimeMerges: state.runtimeMerges.filter((m) => m.id !== mergeId),
    })),

  restoreDefault: () =>
    set((state) => {
      // Keep only cleaning-free, host-set 'blocked' overrides.
      const statusOverrides: FloorSnapshot['statusOverrides'] = {}
      for (const [id, status] of Object.entries(state.statusOverrides)) {
        if (status === 'blocked') statusOverrides[id] = status
      }
      return {
        positionOverrides: {},
        runtimeMerges: state.runtimeMerges.filter((m) => m.seatingId != null),
        statusOverrides,
      }
    }),

  replaceAll: (snapshot) => set({ ...snapshot }),
}))
