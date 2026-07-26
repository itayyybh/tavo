import { create } from 'zustand'
import type { Reservation } from '@/types'

/** Reservation Store — reservations and waiting-list entries. */
interface ReservationState {
  reservations: Reservation[]
  addReservation: (reservation: Reservation) => void
  removeReservation: (id: string) => void
}

export const useReservationStore = create<ReservationState>((set) => ({
  reservations: [],
  addReservation: (reservation) =>
    set((state) => ({ reservations: [...state.reservations, reservation] })),
  removeReservation: (id) =>
    set((state) => ({
      reservations: state.reservations.filter((r) => r.id !== id),
    })),
}))
