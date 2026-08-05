import type { Reservation } from '@/types'

/**
 * Reservation persistence — localStorage for now (real DB arrives in Phase 10).
 * Mirrors `layoutStorage`: a versioned envelope keeps us forward-compatible.
 * Independent key + module so the Table and Reservation engines never share state.
 */
const STORAGE_KEY = 'rfm.reservations'
const VERSION = 1

interface ReservationEnvelope {
  version: number
  reservations: Reservation[]
}

export function saveReservations(reservations: Reservation[]): void {
  try {
    const envelope: ReservationEnvelope = { version: VERSION, reservations }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    // Storage may be unavailable (private mode / quota) — fail silently for MVP.
  }
}

export function loadReservations(): Reservation[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const envelope = JSON.parse(raw) as Partial<ReservationEnvelope>
    if (envelope.version !== VERSION || !Array.isArray(envelope.reservations)) return null
    return envelope.reservations
  } catch {
    return null
  }
}

export function clearReservations(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
