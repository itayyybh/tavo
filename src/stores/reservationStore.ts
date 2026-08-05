import { create } from 'zustand'
import type { ID, Reservation, ReservationStatus } from '@/types'
import { createId } from '@/utils'
import {
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
 * Search / filter / sort live in `@/utils` as pure functions.
 */

/** Input for creating a reservation — the store mints id + timestamps. */
export type NewReservation = Omit<Reservation, 'id' | 'createdAt' | 'updatedAt'>

/** Editable fields on an existing reservation (id/timestamps are managed). */
export type ReservationPatch = Partial<
  Omit<Reservation, 'id' | 'createdAt' | 'updatedAt'>
>

interface ReservationState {
  reservations: Reservation[]
  addReservation: (input: NewReservation) => Reservation
  updateReservation: (id: ID, patch: ReservationPatch) => void
  setStatus: (id: ID, status: ReservationStatus) => void
  /**
   * Reserve table(s) for a reservation (Phase 7 Seating Engine). One id for a
   * single table, several for a deferred merge. Reserve only — no layout mutation
   * or status change; seating happens on the Live Floor (Phase 8).
   */
  assignTable: (id: ID, tableIds: ID[]) => void
  /** Clear a reservation's table assignment. */
  clearAssignment: (id: ID) => void
  removeReservation: (id: ID) => void
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

  assignTable: (id, tableIds) => {
    let updated: Reservation | undefined
    set((state) => ({
      reservations: state.reservations.map((r) => {
        if (r.id !== id) return r
        updated = { ...r, assignedTableIds: tableIds, updatedAt: now() }
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
        updated = { ...r, assignedTableIds: undefined, updatedAt: now() }
        return updated
      }),
    }))
    const rid = activeRestaurant()
    if (rid && updated) persist(repoUpdate(rid, updated))
  },

  removeReservation: (id) => {
    set((state) => ({
      reservations: state.reservations.filter((r) => r.id !== id),
    }))
    const rid = activeRestaurant()
    if (rid) persist(deleteReservation(rid, id))
  },

  replaceAll: (reservations) => set({ reservations }),

  upsertLocal: (reservation) =>
    set((state) => {
      const exists = state.reservations.some((r) => r.id === reservation.id)
      return {
        reservations: exists
          ? state.reservations.map((r) => (r.id === reservation.id ? reservation : r))
          : [...state.reservations, reservation],
      }
    }),

  removeLocal: (id) =>
    set((state) => ({
      reservations: state.reservations.filter((r) => r.id !== id),
    })),
}))
