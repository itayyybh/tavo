import { create } from 'zustand'
import type { FloorSnapshot, ID, Seating, Table, Vec2 } from '@/types'
import { createId, zonesById } from '@/utils'
import { placeMergedBlock, zoneArrangeDir } from '@/services/floor'
import { useDecisionLogStore } from './decisionLogStore'
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
   * Seat a party: create a seating over `tableIds`, clear any stale status
   * override, and move the reservation to `seated`. A multi-table party is
   * joined into one runtime merge. `arrange` (default true) snaps the members
   * into one touching cluster (used by auto-seat / suggestions); pass `false`
   * for a host drag-to-seat, where the tables must stay EXACTLY where they are
   * (the host placed them — never fling them around or out of the zone).
   */
  seat: (reservationId: ID, tableIds: ID[], arrange?: boolean) => void
  /**
   * Clear a seated party: drop the seating, split its runtime merge, snap those
   * tables back to base position/rotation, put them into `cleaning`, and move the
   * reservation to `completed`.
   */
  clear: (seatingId: ID) => void
  /** Finish turnover — remove the `cleaning` override so the table reads available. */
  finishCleaning: (tableId: ID) => void
  /** Finish turnover on every cleaning table at once. */
  finishAllCleaning: () => void
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
  /**
   * End-of-day reset: wipe the ENTIRE runtime layer back to the base layout —
   * every seating, runtime merge, status override (incl. `blocked`), turnover,
   * and furniture move cleared. Unlike `restoreDefault` (which preserves active
   * seatings and host `blocked` marks), this is the clean slate for a new
   * service, run once the day's bookings are all done.
   */
  resetService: () => void
  /** Replace the whole runtime layer — used to hydrate from storage. */
  replaceAll: (snapshot: FloorSnapshot) => void
  /**
   * Adopt a plan day's arrangement into the live shift when that day becomes
   * today — the room opens pre-set the way it was planned. Additive and safe:
   * a table already seated or in a live merge is left exactly as it is, so this
   * never disturbs service in progress. Runs once per day (guarded by the caller).
   */
  adoptPlan: (arrangement: {
    positionOverrides: Record<ID, Vec2>
    rotationOverrides: Record<ID, number>
    merges: { tableIds: ID[]; needsArrange?: boolean }[]
  }) => void

  // Undo/redo of manual floor edits (move, rotate, merge, split, status). Seat/
  // clear and hydration reset the stacks — they cross into the reservation engine,
  // so undoing across them can't stay consistent. Not part of `FloorSnapshot`, so
  // never persisted or synced (`snapshotOf` in `useFloorSync` picks only content).
  past: FloorSnapshot[]
  future: FloorSnapshot[]
  /** Restore the previous manual-edit state; no-op if nothing to undo. */
  undo: () => void
  /** Re-apply an undone manual-edit state; no-op if nothing to redo. */
  redo: () => void
}

const now = () => new Date().toISOString()

/** Deepest history we keep — furniture drags are chatty, so cap the stack. */
const HISTORY_LIMIT = 50

/** The six content fields — the persistable/undoable slice of the floor state. */
function pickSnapshot(s: FloorSnapshot): FloorSnapshot {
  return {
    seatings: s.seatings,
    runtimeMerges: s.runtimeMerges,
    statusOverrides: s.statusOverrides,
    cleaningSince: s.cleaningSince,
    positionOverrides: s.positionOverrides,
    rotationOverrides: s.rotationOverrides,
  }
}

/** Remove one key from a record without mutating the original. */
function omit<V>(record: Record<ID, V>, key: ID): Record<ID, V> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

/**
 * Compute position + rotation overrides that snap `tableIds` into one touching
 * cluster — the same arrangement (and legality gate) the editor's merge uses, so
 * a floor merge looks identical. Arranges from the tables' CURRENT (effective)
 * placement.
 *
 * `clear: false` when no fully clear spot was found — the tables still land in
 * the correctly ORDERED line (a round member is always pushed to an end; see
 * `placeMergedBlock`), just not guaranteed overlap-free. Empty overrides only
 * for < 2 members (nothing to arrange).
 */
export function clusterOverrides(
  tableIds: ID[],
  positionOverrides: Record<ID, Vec2>,
  rotationOverrides: Record<ID, number>,
  /** The reservation's zone — the block is anchored on a table in it (bring-in). */
  anchorZoneId?: ID,
): { positions: Record<ID, Vec2>; rotations: Record<ID, number>; clear: boolean } {
  const empty = { positions: {}, rotations: {}, clear: true }
  if (tableIds.length < 2) return empty
  const memberSet = new Set(tableIds)
  const { tables, tableTypes, obstacles, zones, mergedGroups } = useLayoutStore.getState()
  const effective = (t: Table): Table => ({
    ...t,
    position: positionOverrides[t.id] ?? t.position,
    rotation: rotationOverrides[t.id] ?? t.rotation,
  })
  const members = tables.filter((t) => memberSet.has(t.id)).map(effective)
  if (members.length < 2) return empty
  const others = tables.filter((t) => !memberSet.has(t.id)).map(effective)
  // A merged group's manual clearance override wins for all its members (mirrors
  // the editor); otherwise fall back to the table type's clearance.
  const clearanceOf = (t: Table) => {
    if (t.mergedGroupId) {
      const g = mergedGroups.find((mg) => mg.id === t.mergedGroupId)
      if (g?.clearance != null) return g.clearance
    }
    return tableTypes.find((ty) => ty.id === t.typeId)?.clearance ?? 0
  }
  // Anchor on the LARGEST table in the reservation's zone: the biggest table
  // stays put (the line origins on it) and the smaller ones are pulled to it,
  // rather than dragging the prime table across the floor. Preferring an in-zone
  // table also pulls a brought-in donor INTO the zone. The build direction
  // follows the anchor's zone rule.
  const capOf = (t: Table) =>
    tableTypes.find((ty) => ty.id === t.typeId)?.connectedCapacity ?? 0
  const areaOf = (t: Table) => t.size.x * t.size.y
  const anchorPool =
    anchorZoneId && members.some((m) => m.zoneId === anchorZoneId)
      ? members.filter((m) => m.zoneId === anchorZoneId)
      : members
  const anchor = [...anchorPool].sort(
    (a, b) => capOf(b) - capOf(a) || areaOf(b) - areaOf(a) || a.id.localeCompare(b.id),
  )[0]
  const zone = zones.find((z) => z.id === anchor.zoneId)
  const dir = zoneArrangeDir(zone)
  // The merged block must stay inside the anchor's zone — never spill into empty
  // space or another zone. `zone` is undefined only for an unzoned table (no
  // containment to enforce then).
  const arranged = placeMergedBlock(
    members,
    tableTypes,
    {
      tables: others,
      obstacles,
      zones,
      zonesIndex: zonesById(zones),
      clearanceOf,
    },
    dir,
    anchor.id,
    zone,
  )
  if (!arranged) return empty
  const positions: Record<ID, Vec2> = {}
  const rotations: Record<ID, number> = {}
  for (const [id, p] of arranged.placements) {
    positions[id] = p.position
    rotations[id] = p.rotation
  }
  return { positions, rotations, clear: arranged.clear }
}

/**
 * Rotate a group of tables by `deg` about their shared center — the geometry
 * behind `rotateGroup`, extracted so the plan-arrangement store reuses it
 * identically. Reads base position/rotation from the layout store, layering the
 * given overrides on top. Returns the updated override maps.
 */
export function rotateGroupOverrides(
  tableIds: ID[],
  deg: number,
  positionOverrides: Record<ID, Vec2>,
  rotationOverrides: Record<ID, number>,
): { positionOverrides: Record<ID, Vec2>; rotationOverrides: Record<ID, number> } {
  const { tables } = useLayoutStore.getState()
  const baseById = new Map(tables.map((t) => [t.id, t]))
  const posOf = (id: ID) => positionOverrides[id] ?? baseById.get(id)?.position
  const rotOf = (id: ID) => rotationOverrides[id] ?? baseById.get(id)?.rotation ?? 0
  const centers = tableIds.map(posOf).filter((p): p is Vec2 => !!p)
  const nextPos = { ...positionOverrides }
  const nextRot = { ...rotationOverrides }
  if (centers.length === 0) return { positionOverrides: nextPos, rotationOverrides: nextRot }
  const cx = centers.reduce((s, p) => s + p.x, 0) / centers.length
  const cy = centers.reduce((s, p) => s + p.y, 0) / centers.length
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  for (const id of tableIds) {
    const p = posOf(id)
    if (!p) continue
    const dx = p.x - cx
    const dy = p.y - cy
    nextPos[id] = { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
    nextRot[id] = (rotOf(id) + deg) % 360
  }
  return { positionOverrides: nextPos, rotationOverrides: nextRot }
}

export const useFloorStore = create<FloorState>((set, get) => {
  // Push the current content onto the undo stack (clearing redo). Called at the
  // top of each manual-edit action, just after its early-out guards.
  const record = () => {
    const s = get()
    set({ past: [...s.past, pickSnapshot(s)].slice(-HISTORY_LIMIT), future: [] })
  }
  // Wipe both stacks — used when a seat/clear/hydration makes older manual-edit
  // snapshots unsafe to restore (they'd desync from the reservation engine).
  const resetHistory = () => set({ past: [], future: [] })

  return {
  seatings: [],
  runtimeMerges: [],
  statusOverrides: {},
  cleaningSince: {},
  positionOverrides: {},
  rotationOverrides: {},
  past: [],
  future: [],

  seat: (reservationId, tableIds, arrange = true) => {
    if (tableIds.length === 0) return
    resetHistory()
    const seating: Seating = {
      id: createId(),
      reservationId,
      tableIds: [...tableIds].sort(),
      seatedAt: now(),
    }

    // A multi-table party physically joins into one merged table (editor geometry),
    // anchored in the reservation's zone so a brought-in table is pulled to it.
    // `arrange: false` (host drag-to-seat) skips this entirely — the tables stay
    // exactly where they sit, and the merge just wraps them.
    const anchorZoneId = useReservationStore
      .getState()
      .reservations.find((r) => r.id === reservationId)?.preferredZoneId
    const cluster =
      arrange && seating.tableIds.length > 1
        ? clusterOverrides(
            seating.tableIds,
            get().positionOverrides,
            get().rotationOverrides,
            anchorZoneId,
          )
        : null
    // No fully clear spot for the block → tables still land correctly ordered
    // (round pushed to an end) but not guaranteed overlap-free; the host is
    // asked to double-check/arrange by hand.
    const needsArrange = seating.tableIds.length > 1 && cluster != null && !cluster.clear

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
              {
                id: createId(),
                tableIds: seating.tableIds,
                seatingId: seating.id,
                needsArrange,
              },
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
    // The seated party physically holds these tables. Record that on the
    // reservation (a manual pin) alongside the status flip, so the Seating Engine
    // treats them as busy for any overlapping booking — otherwise a party seated
    // on an open table is still recommended to the next reservation in its window.
    useReservationStore.getState().updateReservation(reservationId, {
      assignedTableIds: seating.tableIds,
      assignmentSource: 'manual',
      status: 'seated',
    })
  },

  clear: (seatingId) => {
    const seating = get().seatings.find((s) => s.id === seatingId)
    if (!seating) return
    resetHistory()
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

    // Grade the engine's prediction: stamp the real seated duration onto this
    // reservation's decision (P3 — outcome recording). No-ops if the seating
    // never ran the engine.
    const seatedMs = Date.parse(seating.seatedAt)
    if (!Number.isNaN(seatedMs)) {
      const actualMinutes = Math.max(0, Math.round((Date.now() - seatedMs) / 60000))
      useDecisionLogStore.getState().recordOutcome(seating.reservationId, actualMinutes)
    }
  },

  finishCleaning: (tableId) => {
    if (get().statusOverrides[tableId] !== 'cleaning') return
    record()
    set((state) =>
      state.statusOverrides[tableId] === 'cleaning'
        ? {
            statusOverrides: omit(state.statusOverrides, tableId),
            cleaningSince: omit(state.cleaningSince, tableId),
          }
        : state,
    )
  },

  finishAllCleaning: () => {
    record()
    set((state) => {
      const statusOverrides = { ...state.statusOverrides }
      const cleaningSince = { ...state.cleaningSince }
      for (const [id, status] of Object.entries(state.statusOverrides)) {
        if (status === 'cleaning') {
          delete statusOverrides[id]
          delete cleaningSince[id]
        }
      }
      return { statusOverrides, cleaningSince }
    })
  },

  setTableStatus: (tableId, status) => {
    record()
    set((state) => ({
      statusOverrides:
        status === undefined
          ? omit(state.statusOverrides, tableId)
          : { ...state.statusOverrides, [tableId]: status },
      cleaningSince:
        status === 'cleaning'
          ? { ...state.cleaningSince, [tableId]: now() }
          : omit(state.cleaningSince, tableId),
    }))
  },

  moveTable: (tableId, position) => {
    record()
    set((state) => ({
      positionOverrides: { ...state.positionOverrides, [tableId]: position },
    }))
  },

  moveTablesBy: (tableIds, delta) => {
    record()
    set((state) => {
      const { tables } = useLayoutStore.getState()
      const basePos = new Map(tables.map((t) => [t.id, t.position]))
      const positionOverrides = { ...state.positionOverrides }
      for (const id of tableIds) {
        const cur = positionOverrides[id] ?? basePos.get(id)
        if (cur) positionOverrides[id] = { x: cur.x + delta.x, y: cur.y + delta.y }
      }
      // Dragging a whole merged group into place IS the manual arrangement — clear
      // its `needsArrange` flag (and its hint) once the host has positioned it.
      const moved = new Set(tableIds)
      const runtimeMerges = state.runtimeMerges.map((m) =>
        m.needsArrange &&
        m.tableIds.length === moved.size &&
        m.tableIds.every((id) => moved.has(id))
          ? { ...m, needsArrange: false }
          : m,
      )
      return { positionOverrides, runtimeMerges }
    })
  },

  rotateTable: (tableId, rotation) => {
    record()
    set((state) => ({
      rotationOverrides: { ...state.rotationOverrides, [tableId]: rotation },
    }))
  },

  rotateGroup: (tableIds, deg) => {
    record()
    set((state) => {
      const { tables } = useLayoutStore.getState()
      const baseById = new Map(tables.map((t) => [t.id, t]))
      const posOf = (id: ID) => state.positionOverrides[id] ?? baseById.get(id)?.position
      const rotOf = (id: ID) =>
        state.rotationOverrides[id] ?? baseById.get(id)?.rotation ?? 0
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
        positionOverrides[id] = {
          x: cx + dx * cos - dy * sin,
          y: cy + dx * sin + dy * cos,
        }
        rotationOverrides[id] = (rotOf(id) + deg) % 360
      }
      return { positionOverrides, rotationOverrides }
    })
  },

  mergeTables: (tableIds) => {
    const ids = [...new Set(tableIds)]
    if (ids.length < 2) return
    record()
    const cluster = clusterOverrides(
      ids,
      get().positionOverrides,
      get().rotationOverrides,
    )
    const needsArrange = !cluster.clear
    set((state) => ({
      runtimeMerges: [
        ...state.runtimeMerges,
        { id: createId(), tableIds: [...ids].sort(), seatingId: undefined, needsArrange },
      ],
      positionOverrides: { ...state.positionOverrides, ...cluster.positions },
      rotationOverrides: { ...state.rotationOverrides, ...cluster.rotations },
    }))
  },

  splitRuntime: (mergeId) => {
    if (!get().runtimeMerges.some((m) => m.id === mergeId)) return
    record()
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
    })
  },

  restoreDefault: () => {
    record()
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
    })
  },

  resetService: () => {
    set({
      seatings: [],
      runtimeMerges: [],
      statusOverrides: {},
      cleaningSince: {},
      positionOverrides: {},
      rotationOverrides: {},
    })
    resetHistory()
  },

  adoptPlan: (arrangement) => {
    set((state) => {
      // Tables already in play this shift — a seated party or an existing runtime
      // merge — are untouchable: keep the live floor authoritative over the plan.
      const inPlay = new Set<ID>([
        ...state.seatings.flatMap((s) => s.tableIds),
        ...state.runtimeMerges.flatMap((m) => m.tableIds),
      ])
      const positionOverrides = { ...state.positionOverrides }
      const rotationOverrides = { ...state.rotationOverrides }
      for (const [id, p] of Object.entries(arrangement.positionOverrides)) {
        if (!inPlay.has(id)) positionOverrides[id] = p
      }
      for (const [id, r] of Object.entries(arrangement.rotationOverrides)) {
        if (!inPlay.has(id)) rotationOverrides[id] = r
      }
      const runtimeMerges = [...state.runtimeMerges]
      for (const m of arrangement.merges) {
        if (m.tableIds.some((id) => inPlay.has(id))) continue
        runtimeMerges.push({
          id: createId(),
          tableIds: [...m.tableIds].sort(),
          seatingId: undefined,
          needsArrange: m.needsArrange,
        })
        m.tableIds.forEach((id) => inPlay.add(id))
      }
      return { positionOverrides, rotationOverrides, runtimeMerges }
    })
    resetHistory()
  },

  replaceAll: (snapshot) => {
    // Pure hydration / cross-device sync — replace content only. Deliberately does
    // NOT touch the undo stacks: the sync layer re-applies snapshots frequently
    // (its own echo, re-hydration), and wiping history on each would destroy a
    // host's in-progress undo. Cross-device conflicts already resolve last-write-
    // wins, so keeping a possibly-stale local stack is no worse. Only the
    // reservation-coupled actions (seat/clear/resetService) reset history.
    set({ ...snapshot })
  },

  undo: () => {
    const s = get()
    if (s.past.length === 0) return
    const previous = s.past[s.past.length - 1]
    set({
      ...previous,
      past: s.past.slice(0, -1),
      future: [...s.future, pickSnapshot(s)],
    })
  },

  redo: () => {
    const s = get()
    if (s.future.length === 0) return
    const next = s.future[s.future.length - 1]
    set({
      ...next,
      past: [...s.past, pickSnapshot(s)],
      future: s.future.slice(0, -1),
    })
  },
  }
})
