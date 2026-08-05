import { create } from 'zustand'
import type { ID, Reservation, ReservationStatus } from '@/types'
import { createId } from '@/utils'

/**
 * Reservation Store — the sole owner of reservation state.
 *
 * Deliberately INDEPENDENT of the Layout/Table stores: it never imports or
 * mutates tables. The Seating Engine (Phase 7) will read from here and from the
 * layout store to connect them; neither engine reaches into the other.
 *
 * Search / filter / sort live in `@/utils` as pure functions (testable, cheap to
 * memoize) — the store only holds normalized data and mutations.
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
  /** Replace the whole collection — used to hydrate from storage. */
  replaceAll: (reservations: Reservation[]) => void
}

const now = () => new Date().toISOString()

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
    return reservation
  },

  updateReservation: (id, patch) =>
    set((state) => ({
      reservations: state.reservations.map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: now() } : r,
      ),
    })),

  setStatus: (id, status) =>
    set((state) => ({
      reservations: state.reservations.map((r) =>
        r.id === id ? { ...r, status, updatedAt: now() } : r,
      ),
    })),

  assignTable: (id, tableIds) =>
    set((state) => ({
      reservations: state.reservations.map((r) =>
        r.id === id ? { ...r, assignedTableIds: tableIds, updatedAt: now() } : r,
      ),
    })),

  clearAssignment: (id) =>
    set((state) => ({
      reservations: state.reservations.map((r) =>
        r.id === id ? { ...r, assignedTableIds: undefined, updatedAt: now() } : r,
      ),
    })),

  removeReservation: (id) =>
    set((state) => ({
      reservations: state.reservations.filter((r) => r.id !== id),
    })),

  replaceAll: (reservations) => set({ reservations }),
}))
