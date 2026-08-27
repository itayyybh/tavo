import { create } from 'zustand'
import type { ID, RuntimeMergedGroup, Vec2 } from '@/types'
import { createId, todayKey } from '@/utils'
import { useLayoutStore } from './layoutStore'
import { useFloorStore, clusterOverrides, rotateGroupOverrides } from './floorStore'

/**
 * Plan Floor Store — per-day physical arrangement for PLAN mode.
 *
 * Plan mode lets the host lay out the restaurant for another day: push tables
 * together for a big booking, move and rotate them, and see the room as it will
 * actually look at that service — WITHOUT touching today's live floor. Each day's
 * arrangement is kept separately (keyed by `YYYY-MM-DD`), so planning tomorrow
 * never disturbs today's running shift (which lives in `floorStore`).
 *
 * This holds ONLY the visual arrangement (moves, rotations, host merges). The
 * durable plan — which tables a booking gets — is the reservation's
 * `assignedTableIds`; this store is the preview layer on top of it. It is local
 * to the session (not synced): the arrangement is a planning aid, re-derivable
 * from the assignments, so it doesn't need to persist.
 */
export interface PlanArrangement {
  positionOverrides: Record<ID, Vec2>
  rotationOverrides: Record<ID, number>
  /** Host-made merges for this plan day (unowned — no seating). */
  merges: RuntimeMergedGroup[]
}

const EMPTY: PlanArrangement = {
  positionOverrides: {},
  rotationOverrides: {},
  merges: [],
}

interface PlanFloorState {
  /** Arrangement per plan day. Absent day = the untouched base layout. */
  byDay: Record<string, PlanArrangement>
  /** Days whose plan was already handed off to the live shift (apply-once guard). */
  appliedDays: Record<string, true>
  /** Mark a day's plan as adopted into live service so it isn't applied twice. */
  markApplied: (day: string) => void
  /** Record a moved table's center for the plan day. */
  movePlanTable: (day: string, tableId: ID, position: Vec2) => void
  /** Shift several tables by a delta (moves a whole merged group as one). */
  movePlanTablesBy: (day: string, tableIds: ID[], delta: Vec2) => void
  /** Rotate a single table to an absolute rotation. */
  rotatePlanTable: (day: string, tableId: ID, rotation: number) => void
  /** Rotate several tables together by `deg` about their shared center. */
  rotatePlanGroup: (day: string, tableIds: ID[], deg: number) => void
  /** Merge tables for the plan day: snap into one cluster + record the merge. */
  mergePlan: (day: string, tableIds: ID[]) => void
  /**
   * Reconcile the booking-derived merges for a plan day against the current
   * multi-table bookings: add a clustered merge for each, drop stale ones (a
   * booking unplanned or re-tabled), and leave host-made merges alone. Keeps the
   * arrangement from accumulating orphaned merges (which render as blank tables).
   */
  syncBookingMerges: (day: string, bookings: { id: ID; tableIds: ID[] }[]) => void
  /** Split a plan merge and restore its tables' base position/rotation. */
  splitPlan: (day: string, mergeId: ID) => void
  /** Clear the whole arrangement for a day (reset to base layout). */
  resetPlanDay: (day: string) => void
}

/** Read a day's arrangement, defaulting to the empty (base) one. */
const dayOf = (byDay: Record<string, PlanArrangement>, day: string): PlanArrangement =>
  byDay[day] ?? EMPTY

/**
 * Per-day plan arrangements survive a reload (a preview the host built shouldn't
 * vanish when they close the tab), but stay device-local — they're a planning aid,
 * not tenant data. Past days are pruned on load: a plan is only ever for today or
 * later (`YYYY-MM-DD` sorts chronologically, so `>= today` keeps the useful ones).
 */
const STORAGE_KEY = 'floor-manager.plan-arrangements'

interface Persisted {
  byDay: Record<string, PlanArrangement>
  appliedDays: Record<string, true>
}

function load(): Persisted {
  if (typeof localStorage === 'undefined') return { byDay: {}, appliedDays: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { byDay: {}, appliedDays: {} }
    const parsed = JSON.parse(raw) as Partial<Persisted>
    const today = todayKey()
    const byDay: Record<string, PlanArrangement> = {}
    for (const [day, arr] of Object.entries(parsed.byDay ?? {})) {
      if (
        day >= today &&
        arr &&
        arr.positionOverrides &&
        arr.rotationOverrides &&
        Array.isArray(arr.merges)
      ) {
        byDay[day] = arr as PlanArrangement
      }
    }
    const appliedDays: Record<string, true> = {}
    for (const day of Object.keys(parsed.appliedDays ?? {})) {
      if (day >= today) appliedDays[day] = true
    }
    return { byDay, appliedDays }
  } catch {
    return { byDay: {}, appliedDays: {} }
  }
}

function save(state: Persisted): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ byDay: state.byDay, appliedDays: state.appliedDays }),
    )
  } catch {
    // Storage full or unavailable — a lost preview is non-fatal.
  }
}

const PERSISTED = load()

export const usePlanFloorStore = create<PlanFloorState>((set) => {
  // Apply a patch to one day's arrangement, leaving other days untouched.
  const patch = (
    day: string,
    fn: (arr: PlanArrangement) => PlanArrangement,
  ) =>
    set((state) => ({
      byDay: { ...state.byDay, [day]: fn(dayOf(state.byDay, day)) },
    }))

  return {
    byDay: PERSISTED.byDay,
    appliedDays: PERSISTED.appliedDays,

    markApplied: (day) =>
      set((state) =>
        state.appliedDays[day]
          ? state
          : { appliedDays: { ...state.appliedDays, [day]: true } },
      ),

    movePlanTable: (day, tableId, position) =>
      patch(day, (arr) => ({
        ...arr,
        positionOverrides: { ...arr.positionOverrides, [tableId]: position },
      })),

    movePlanTablesBy: (day, tableIds, delta) =>
      patch(day, (arr) => {
        const { tables } = useLayoutStore.getState()
        const basePos = new Map(tables.map((t) => [t.id, t.position]))
        const positionOverrides = { ...arr.positionOverrides }
        for (const id of tableIds) {
          const cur = positionOverrides[id] ?? basePos.get(id)
          if (cur) positionOverrides[id] = { x: cur.x + delta.x, y: cur.y + delta.y }
        }
        const moved = new Set(tableIds)
        const merges = arr.merges.map((m) =>
          m.needsArrange &&
          m.tableIds.length === moved.size &&
          m.tableIds.every((id) => moved.has(id))
            ? { ...m, needsArrange: false }
            : m,
        )
        return { ...arr, positionOverrides, merges }
      }),

    rotatePlanTable: (day, tableId, rotation) =>
      patch(day, (arr) => ({
        ...arr,
        rotationOverrides: { ...arr.rotationOverrides, [tableId]: rotation },
      })),

    rotatePlanGroup: (day, tableIds, deg) =>
      patch(day, (arr) => {
        const { positionOverrides, rotationOverrides } = rotateGroupOverrides(
          tableIds,
          deg,
          arr.positionOverrides,
          arr.rotationOverrides,
        )
        return { ...arr, positionOverrides, rotationOverrides }
      }),

    mergePlan: (day, tableIds) => {
      const ids = [...new Set(tableIds)]
      if (ids.length < 2) return
      patch(day, (arr) => {
        // Already merged as this exact group — nothing to do.
        const key = [...ids].sort().join('+')
        if (arr.merges.some((m) => [...m.tableIds].sort().join('+') === key)) return arr
        const cluster = clusterOverrides(
          ids,
          arr.positionOverrides,
          arr.rotationOverrides,
        )
        return {
          positionOverrides: { ...arr.positionOverrides, ...cluster.positions },
          rotationOverrides: { ...arr.rotationOverrides, ...cluster.rotations },
          merges: [
            ...arr.merges,
            {
              id: createId(),
              tableIds: [...ids].sort(),
              seatingId: undefined,
              needsArrange: !cluster.clear,
            },
          ],
        }
      })
    },

    syncBookingMerges: (day, bookings) =>
      patch(day, (arr) => {
        // Desired booking merges, keyed `res-<id>` so they're distinguishable from
        // host-made merges (which carry random ids and are always preserved).
        const desired = new Map<string, ID[]>()
        for (const b of bookings) {
          if (b.tableIds.length >= 2) desired.set(`res-${b.id}`, [...b.tableIds].sort())
        }

        const positionOverrides = { ...arr.positionOverrides }
        const rotationOverrides = { ...arr.rotationOverrides }
        const kept: RuntimeMergedGroup[] = []
        const stale: ID[] = []
        for (const m of arr.merges) {
          if (!m.id.startsWith('res-')) {
            kept.push(m) // host merge — leave untouched
            continue
          }
          const want = desired.get(m.id)
          if (want && want.join('+') === [...m.tableIds].sort().join('+')) {
            kept.push(m)
            desired.delete(m.id) // already present and correct — nothing to add
          } else {
            stale.push(...m.tableIds) // booking gone or re-tabled — drop this merge
          }
        }
        if (stale.length === 0 && desired.size === 0) return arr // already in sync

        // Free the overrides of tables from dropped merges, unless another kept
        // merge still owns them, so they snap back to base position/rotation.
        const keptTables = new Set(kept.flatMap((m) => m.tableIds))
        for (const id of stale) {
          if (keptTables.has(id)) continue
          delete positionOverrides[id]
          delete rotationOverrides[id]
        }

        const merges = [...kept]
        const covered = new Set(merges.flatMap((m) => m.tableIds))
        for (const [id, ids] of desired) {
          if (ids.some((t) => covered.has(t))) continue
          const cluster = clusterOverrides(ids, positionOverrides, rotationOverrides)
          Object.assign(positionOverrides, cluster.positions)
          Object.assign(rotationOverrides, cluster.rotations)
          merges.push({ id, tableIds: ids, seatingId: undefined, needsArrange: !cluster.clear })
          ids.forEach((t) => covered.add(t))
        }
        return { positionOverrides, rotationOverrides, merges }
      }),

    splitPlan: (day, mergeId) =>
      patch(day, (arr) => {
        const group = arr.merges.find((m) => m.id === mergeId)
        if (!group) return arr
        const positionOverrides = { ...arr.positionOverrides }
        const rotationOverrides = { ...arr.rotationOverrides }
        for (const id of group.tableIds) {
          delete positionOverrides[id]
          delete rotationOverrides[id]
        }
        return {
          positionOverrides,
          rotationOverrides,
          merges: arr.merges.filter((m) => m.id !== mergeId),
        }
      }),

    resetPlanDay: (day) =>
      set((state) => {
        if (!(day in state.byDay)) return state
        const byDay = { ...state.byDay }
        delete byDay[day]
        return { byDay }
      }),
  }
})

// Persist the per-day arrangements + applied-day guards on change (device-local).
usePlanFloorStore.subscribe((state, prev) => {
  if (state.byDay !== prev.byDay || state.appliedDays !== prev.appliedDays) save(state)
})

/**
 * Hand today's plan off to the live shift: when the day the host planned becomes
 * today, its arrangement (merges/moves/rotations) is adopted into the live floor
 * so the room opens pre-set. Runs once per day per device (`appliedDays` guard);
 * `adoptPlan` is additive and idempotent, so a second device — or a re-run after
 * the plan is already in the live snapshot — is a safe no-op. Call right AFTER
 * the live floor has hydrated, so the adoption lands on top of the loaded shift
 * rather than being clobbered by it.
 */
export function adoptTodayPlanIntoLive(): void {
  const today = todayKey()
  const state = usePlanFloorStore.getState()
  if (state.appliedDays[today]) return
  state.markApplied(today)
  const arr = state.byDay[today]
  if (!arr) return
  const nonEmpty =
    Object.keys(arr.positionOverrides).length > 0 ||
    Object.keys(arr.rotationOverrides).length > 0 ||
    arr.merges.length > 0
  if (nonEmpty) useFloorStore.getState().adoptPlan(arr)
}
