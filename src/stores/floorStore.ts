import { create } from 'zustand'
import type { FloorSnapshot, ID, Seating, Table, Vec2 } from '@/types'
import { createId } from '@/utils'
import { arrangeSeatingCluster, zoneArrangeDir } from '@/services/floor'
import { useLayoutStore } from './layoutStore'
import { useReservationStore } from './reservationStore'

/**
 * Floor Store (Phase 8) — the runtime override layer for the CURRENT shift.
 *
 * It records only what this shift changed on top of the base layout: who's
 * seated, which tables staff pushed together, moved or turned, and manual runtime
 * status (cleaning after turnover, host-blocked). The base design lives in
 * `layoutStore` and this store NEVER mutates it — `deriveFloorState` combines the
 * two into the effective floor the host sees (`effectiveTable = base + override`).
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
   * Seat a party: create a seating over `tableIds`, physically join a multi-table
   * party into one merged cluster, clear any stale status override, and move the
   * reservation to `seated`.
   */
  seat: (reservationId: ID, tableIds: ID[]) => void
  /**
   * Clear a seated party: drop the seating, split its runtime merge, snap those
   * tables back to base position/rotation, put them into `cleaning`, and move the
   * reservation to `completed`.
   */
  clear: (seatingId: ID) => void
  /** Finish turnover — remove the `cleaning` override so the table reads available. */
  finishCleaning: (tableId: ID) => void
  /** Set (or clear, with `undefined`) a manual runtime status override for a table. */
  setTableStatus: (tableId: ID, status: ManualFloorStatus | undefined) => void
  /** Record a runtime center position for a table staff physically moved. */
  moveTable: (tableId: ID, position: Vec2) => void
  /** Shift several tables by a delta (moves a whole merged group as one). */
  moveTablesBy: (tableIds: ID[], delta: Vec2) => void
  /** Record a runtime rotation (degrees) for a table staff turned. */
  rotateTable: (tableId: ID, rotation: number) => void
  /** Rotate several tables together by `deg` about their shared center (a group). */
  rotateGroup: (tableIds: ID[], deg: number) => void
  /**
   * Host-merge tables for this shift: snap them into one touching cluster (editor
   * geometry, rotation zeroed) and record an unowned runtime merge.
   */
  mergeTables: (tableIds: ID[]) => void
  /** Split a runtime merge and restore its tables' base position/rotation. */
  splitRuntime: (mergeId: ID) => void
  /**
   * Restore the base layout: reset all furniture (position + rotation), dissolve
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

/**
 * Compute position + rotation overrides that snap `tableIds` into one touching
 * cluster — the same arrangement the editor's merge uses, so a floor merge looks
 * identical. Arranges from the tables' CURRENT (effective) placement and zeroes
 * their rotation. Empty for fewer than two members.
 */
function clusterOverrides(
  tableIds: ID[],
  positionOverrides: Record<ID, Vec2>,
  rotationOverrides: Record<ID, number>,
): { positions: Record<ID, Vec2>; rotations: Record<ID, number> } {
  if (tableIds.length < 2) return { positions: {}, rotations: {} }
  const memberSet = new Set(tableIds)
  const { tables, tableTypes, obstacles, zones } = useLayoutStore.getState()
  const effective = (t: Table): Table => ({
    ...t,
    position: positionOverrides[t.id] ?? t.position,
    rotation: rotationOverrides[t.id] ?? t.rotation,
  })
  const members = tables.filter((t) => memberSet.has(t.id)).map(effective)
  if (members.length < 2) return { positions: {}, rotations: {} }
  const others = tables.filter((t) => !memberSet.has(t.id)).map(effective)
  // Zone rule: non-smoking builds vertically, smoking horizontally (soft).
  const zone = zones.find((z) => z.id === members[0].zoneId)
  const dir = zoneArrangeDir(zone)
  const arranged = arrangeSeatingCluster(members, tableTypes, others, obstacles, dir)
  const positions: Record<ID, Vec2> = {}
  const rotations: Record<ID, number> = {}
  for (const [id, p] of arranged) {
    positions[id] = p
    rotations[id] = 0
  }
  return { positions, rotations }
}

export const useFloorStore = create<FloorState>((set, get) => ({
  seatings: [],
  runtimeMerges: [],
  statusOverrides: {},
  cleaningSince: {},
  positionOverrides: {},
  rotationOverrides: {},

  seat: (reservationId, tableIds) => {
    if (tableIds.length === 0) return
    const seating: Seating = {
      id: createId(),
      reservationId,
      tableIds: [...tableIds].sort(),
      seatedAt: now(),
    }

    // A multi-table party physically joins into one merged table (editor geometry).
    const cluster =
      seating.tableIds.length > 1
        ? clusterOverrides(seating.tableIds, get().positionOverrides, get().rotationOverrides)
        : null

    set((state) => {
      // Seating occupies the tables — drop any stale cleaning/blocked override.
      let statusOverrides = state.statusOverrides
      let cleaningSince = state.cleaningSince
      for (const id of seating.tableIds) {
        statusOverrides = omit(statusOverrides, id)
        cleaningSince = omit(cleaningSince, id)
      }

      const runtimeMerges =
        seating.tableIds.length > 1
          ? [
              ...state.runtimeMerges,
              { id: createId(), tableIds: seating.tableIds, seatingId: seating.id },
            ]
          : state.runtimeMerges

      return {
        seatings: [...state.seatings, seating],
        runtimeMerges,
        statusOverrides,
        cleaningSince,
        positionOverrides: cluster
          ? { ...state.positionOverrides, ...cluster.positions }
          : state.positionOverrides,
        rotationOverrides: cluster
          ? { ...state.rotationOverrides, ...cluster.rotations }
          : state.rotationOverrides,
      }
    })
    useReservationStore.getState().setStatus(reservationId, 'seated')
  },

  clear: (seatingId) => {
    const seating = get().seatings.find((s) => s.id === seatingId)
    if (!seating) return
    set((state) => {
      // Tables enter turnover; the party's merge is split and its tables snap back
      // to their base position/rotation.
      const statusOverrides = { ...state.statusOverrides }
      const cleaningSince = { ...state.cleaningSince }
      const positionOverrides = { ...state.positionOverrides }
      const rotationOverrides = { ...state.rotationOverrides }
      const ts = now()
      for (const id of seating.tableIds) {
        statusOverrides[id] = 'cleaning'
        cleaningSince[id] = ts
        delete positionOverrides[id]
        delete rotationOverrides[id]
      }

      return {
        seatings: state.seatings.filter((s) => s.id !== seatingId),
        runtimeMerges: state.runtimeMerges.filter((m) => m.seatingId !== seatingId),
        statusOverrides,
        cleaningSince,
        positionOverrides,
        rotationOverrides,
      }
    })
    useReservationStore.getState().setStatus(seating.reservationId, 'completed')
  },

  finishCleaning: (tableId) =>
    set((state) =>
      state.statusOverrides[tableId] === 'cleaning'
        ? {
            statusOverrides: omit(state.statusOverrides, tableId),
            cleaningSince: omit(state.cleaningSince, tableId),
          }
        : state,
    ),

  setTableStatus: (tableId, status) =>
    set((state) => ({
      statusOverrides:
        status === undefined
          ? omit(state.statusOverrides, tableId)
          : { ...state.statusOverrides, [tableId]: status },
      cleaningSince:
        status === 'cleaning'
          ? { ...state.cleaningSince, [tableId]: now() }
          : omit(state.cleaningSince, tableId),
    })),

  moveTable: (tableId, position) =>
    set((state) => ({
      positionOverrides: { ...state.positionOverrides, [tableId]: position },
    })),

  moveTablesBy: (tableIds, delta) =>
    set((state) => {
      const { tables } = useLayoutStore.getState()
      const basePos = new Map(tables.map((t) => [t.id, t.position]))
      const positionOverrides = { ...state.positionOverrides }
      for (const id of tableIds) {
        const cur = positionOverrides[id] ?? basePos.get(id)
        if (cur) positionOverrides[id] = { x: cur.x + delta.x, y: cur.y + delta.y }
      }
      return { positionOverrides }
    }),

  rotateTable: (tableId, rotation) =>
    set((state) => ({
      rotationOverrides: { ...state.rotationOverrides, [tableId]: rotation },
    })),

  rotateGroup: (tableIds, deg) =>
    set((state) => {
      const { tables } = useLayoutStore.getState()
      const baseById = new Map(tables.map((t) => [t.id, t]))
      const posOf = (id: ID) => state.positionOverrides[id] ?? baseById.get(id)?.position
      const rotOf = (id: ID) => state.rotationOverrides[id] ?? baseById.get(id)?.rotation ?? 0
      const centers = tableIds.map(posOf).filter((p): p is Vec2 => !!p)
      if (centers.length === 0) return state
      const cx = centers.reduce((s, p) => s + p.x, 0) / centers.length
      const cy = centers.reduce((s, p) => s + p.y, 0) / centers.length
      const rad = (deg * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const positionOverrides = { ...state.positionOverrides }
      const rotationOverrides = { ...state.rotationOverrides }
      for (const id of tableIds) {
        const p = posOf(id)
        if (!p) continue
        const dx = p.x - cx
        const dy = p.y - cy
        positionOverrides[id] = { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
        rotationOverrides[id] = (rotOf(id) + deg) % 360
      }
      return { positionOverrides, rotationOverrides }
    }),

  mergeTables: (tableIds) => {
    const ids = [...new Set(tableIds)]
    if (ids.length < 2) return
    const cluster = clusterOverrides(ids, get().positionOverrides, get().rotationOverrides)
    set((state) => ({
      runtimeMerges: [
        ...state.runtimeMerges,
        { id: createId(), tableIds: [...ids].sort(), seatingId: undefined },
      ],
      positionOverrides: { ...state.positionOverrides, ...cluster.positions },
      rotationOverrides: { ...state.rotationOverrides, ...cluster.rotations },
    }))
  },

  splitRuntime: (mergeId) =>
    set((state) => {
      const group = state.runtimeMerges.find((m) => m.id === mergeId)
      if (!group) return state
      const positionOverrides = { ...state.positionOverrides }
      const rotationOverrides = { ...state.rotationOverrides }
      for (const id of group.tableIds) {
        delete positionOverrides[id]
        delete rotationOverrides[id]
      }
      return {
        runtimeMerges: state.runtimeMerges.filter((m) => m.id !== mergeId),
        positionOverrides,
        rotationOverrides,
      }
    }),

  restoreDefault: () =>
    set((state) => {
      // Keep only cleaning-free, host-set 'blocked' overrides.
      const statusOverrides: FloorSnapshot['statusOverrides'] = {}
      for (const [id, status] of Object.entries(state.statusOverrides)) {
        if (status === 'blocked') statusOverrides[id] = status
      }
      return {
        positionOverrides: {},
        rotationOverrides: {},
        runtimeMerges: state.runtimeMerges.filter((m) => m.seatingId != null),
        statusOverrides,
        cleaningSince: {},
      }
    }),

  replaceAll: (snapshot) => set({ ...snapshot }),
}))
