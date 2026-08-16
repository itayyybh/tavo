import { create } from 'zustand'
import type { ID, Reservation, ReservationStatus } from '@/types'
import { createId } from '@/utils'
import {
  deleteAllReservations,
  deleteArchivedReservations,
  deleteReservation,
  insertReservation,
  updateReservation as repoUpdate,
} from '@/services/supabase/reservationsRepo'
import { useSessionStore } from './sessionStore'

/**
 * Reservation Store — the sole owner of reservation state.
 *
 * Deliberately INDEPENDENT of the Layout/Table stores: it never imports or
 * mutates tables. The Seating Engine (Phase 7) reads from here and the layout
 * store to connect them; neither engine reaches into the other.
 *
 * Phase 9: mutations are WRITE-THROUGH to the tenant's database. Each action
 * updates local state optimistically, then persists in the background (guarded
 * by the active `restaurantId`, so seeding and the signed-out state stay
 * local-only). Realtime patches arrive via `upsertLocal`/`removeLocal`, which
 * intentionally do NOT persist — they'd otherwise echo back to the database.
 *
 * History: reservations are split into two collections — `reservations` (the
 * live service) and `archived` (History). Archiving (host delete, or the
 * end-of-day sweep) moves a row between them via a plain write-through UPDATE
 * (the `archived` flag), so nothing is destroyed and restore is trivial. Every
 * existing consumer reads `reservations` and therefore keeps seeing only the
 * active set, unchanged.
 *
 * Search / filter / sort live in `@/utils` as pure functions.
 */

/** Input for creating a reservation — the store mints id + timestamps. */
export type NewReservation = Omit<Reservation, 'id' | 'createdAt' | 'updatedAt'>

/** Editable fields on an existing reservation (id/timestamps are managed). */
export type ReservationPatch = Partial<
  Omit<Reservation, 'id' | 'createdAt' | 'updatedAt'>
>

interface ReservationState {
  /** The live service — active (non-archived) reservations. */
  reservations: Reservation[]
  /** History — archived reservations (host-deleted or swept at end of day). */
  archived: Reservation[]
  addReservation: (input: NewReservation) => Reservation
  updateReservation: (id: ID, patch: ReservationPatch) => void
  setStatus: (id: ID, status: ReservationStatus) => void
  /**
   * Reserve table(s) for a reservation (Phase 7 Seating Engine). One id for a
   * single table, several for a deferred merge. Reserve only — no layout mutation
   * or status change; seating happens on the Live Floor (Phase 8).
   *
   * `source` records who chose the tables: `manual` (host) pins the assignment so
   * auto-assign and the repack optimizer never move it; `auto` (engine) may be
   * reshuffled. Defaults to `manual` — a direct/host call is pinned unless it
   * explicitly opts into `auto`.
   */
  assignTable: (id: ID, tableIds: ID[], source?: 'manual' | 'auto') => void
  /** Clear a reservation's table assignment. */
  clearAssignment: (id: ID) => void
  /**
   * Host delete — a SOFT delete: moves the reservation to History (recoverable),
   * not a permanent removal. Restore it, or purge it with `hardDelete`.
   */
  removeReservation: (id: ID) => void
  /** Archive several reservations at once (the end-of-day sweep). */
  archiveMany: (ids: ID[], reason: Reservation['archiveReason']) => void
  /** Bring an archived reservation back into the live service. Clears its old
   * table assignment (a past day's tables are stale) and resets it to confirmed. */
  restoreReservation: (id: ID) => void
  /** Permanently delete a reservation (History → gone). No recovery. */
  hardDelete: (id: ID) => void
  /** Permanently delete EVERY archived reservation — empty History. No recovery. */
  clearArchived: () => void
  /**
   * Delete every reservation, active AND archived (Clear All) — a hard,
   * write-through wipe used by admin/dev tooling, unlike `replaceAll`.
   */
  clearAll: () => void
  /** Replace the whole collection — used to hydrate from the database. */
  replaceAll: (reservations: Reservation[]) => void
  /** Apply a remote insert/update (realtime). Local-only: never re-persists. */
  upsertLocal: (reservation: Reservation) => void
  /** Apply a remote delete (realtime). Local-only: never re-persists. */
  removeLocal: (id: ID) => void
}

const now = () => new Date().toISOString()

/** The active tenant, or null when signed out / not yet a member. */
const activeRestaurant = () => useSessionStore.getState().restaurantId

/** Fire-and-forget a background write; surface failures without blocking the UI. */
const persist = (op: Promise<unknown>) => {
  op.catch((err) => console.error('Reservation sync failed', err))
}

export const useReservationStore = create<ReservationState>((set) => ({
  reservations: [],
  archived: [],

  addReservation: (input) => {
    const stamp = now()
    const reservation: Reservation = {
      ...input,
      id: createId(),
      createdAt: stamp,
      updatedAt: stamp,
    }
    set((state) => ({ reservations: [...state.reservations, reservation] }))
    const rid = activeRestaurant()
    if (rid) persist(insertReservation(rid, reservation))
    return reservation
  },

  updateReservation: (id, patch) => {
    let updated: Reservation | undefined
    set((state) => ({
      reservations: state.reservations.map((r) => {
        if (r.id !== id) return r
        updated = { ...r, ...patch, updatedAt: now() }
        return updated
      }),
    }))
    const rid = activeRestaurant()
    if (rid && updated) persist(repoUpdate(rid, updated))
  },

  setStatus: (id, status) => {
    let updated: Reservation | undefined
    set((state) => ({
      reservations: state.reservations.map((r) => {
        if (r.id !== id) return r
        updated = { ...r, status, updatedAt: now() }
        return updated
      }),
    }))
    const rid = activeRestaurant()
    if (rid && updated) persist(repoUpdate(rid, updated))
  },

  assignTable: (id, tableIds, source = 'manual') => {
    let updated: Reservation | undefined
    set((state) => ({
      reservations: state.reservations.map((r) => {
        if (r.id !== id) return r
        updated = {
          ...r,
          assignedTableIds: tableIds,
          assignmentSource: source,
          updatedAt: now(),
        }
        return updated
      }),
    }))
    const rid = activeRestaurant()
    if (rid && updated) persist(repoUpdate(rid, updated))
  },

  clearAssignment: (id) => {
    let updated: Reservation | undefined
    set((state) => ({
      reservations: state.reservations.map((r) => {
        if (r.id !== id) return r
        updated = {
          ...r,
          assignedTableIds: undefined,
          assignmentSource: undefined,
          updatedAt: now(),
        }
        return updated
      }),
    }))
    const rid = activeRestaurant()
    if (rid && updated) persist(repoUpdate(rid, updated))
  },

  removeReservation: (id) => {
    let moved: Reservation | undefined
    set((state) => {
      const target = state.reservations.find((r) => r.id === id)
      if (!target) return state
      moved = {
        ...target,
        archived: true,
        archivedAt: now(),
        archiveReason: 'deleted',
        updatedAt: now(),
      }
      return {
        reservations: state.reservations.filter((r) => r.id !== id),
        archived: [...state.archived, moved],
      }
    })
    const rid = activeRestaurant()
    if (rid && moved) persist(repoUpdate(rid, moved))
  },

  archiveMany: (ids, reason) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const stamp = now()
    let moved: Reservation[] = []
    set((state) => {
      moved = state.reservations
        .filter((r) => idSet.has(r.id))
        .map((r) => ({
          ...r,
          archived: true,
          archivedAt: stamp,
          archiveReason: reason,
          updatedAt: stamp,
        }))
      if (moved.length === 0) return state
      return {
        reservations: state.reservations.filter((r) => !idSet.has(r.id)),
        archived: [...state.archived, ...moved],
      }
    })
    const rid = activeRestaurant()
    if (rid) for (const r of moved) persist(repoUpdate(rid, r))
  },

  restoreReservation: (id) => {
    let restored: Reservation | undefined
    set((state) => {
      const target = state.archived.find((r) => r.id === id)
      if (!target) return state
      // A past day's tables/time are stale — return unassigned and confirmed.
      restored = {
        ...target,
        archived: false,
        archivedAt: undefined,
        archiveReason: undefined,
        assignedTableIds: undefined,
        assignmentSource: undefined,
        status: 'confirmed',
        updatedAt: now(),
      }
      return {
        archived: state.archived.filter((r) => r.id !== id),
        reservations: [...state.reservations, restored],
      }
    })
    const rid = activeRestaurant()
    if (rid && restored) persist(repoUpdate(rid, restored))
  },

  hardDelete: (id) => {
    set((state) => ({
      reservations: state.reservations.filter((r) => r.id !== id),
      archived: state.archived.filter((r) => r.id !== id),
    }))
    const rid = activeRestaurant()
    if (rid) persist(deleteReservation(rid, id))
  },

  clearArchived: () => {
    set({ archived: [] })
    const rid = activeRestaurant()
    if (rid) persist(deleteArchivedReservations(rid))
  },

  clearAll: () => {
    set({ reservations: [], archived: [] })
    const rid = activeRestaurant()
    if (rid) persist(deleteAllReservations(rid))
  },

  replaceAll: (all) =>
    set({
      reservations: all.filter((r) => !r.archived),
      archived: all.filter((r) => r.archived),
    }),

  upsertLocal: (reservation) =>
    set((state) => {
      // Drop any prior copy from both buckets, then place by its archived flag —
      // this handles a realtime archive/restore that flips which bucket it's in.
      const reservations = state.reservations.filter((r) => r.id !== reservation.id)
      const archived = state.archived.filter((r) => r.id !== reservation.id)
      if (reservation.archived) archived.push(reservation)
      else reservations.push(reservation)
      return { reservations, archived }
    }),

  removeLocal: (id) =>
    set((state) => ({
      reservations: state.reservations.filter((r) => r.id !== id),
      archived: state.archived.filter((r) => r.id !== id),
    })),
}))
