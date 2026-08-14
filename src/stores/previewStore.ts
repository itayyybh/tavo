import { create } from 'zustand'
import type { ID } from '@/types'

/**
 * Seating Preview store (Phase 12) — ephemeral, never persisted.
 *
 * Holds the hypothetical seating options the host is currently PREVIEWING: "how
 * would the floor look if I seated this party here" without writing an
 * assignment or logging a decision. The floor derivation (`deriveFloorState`)
 * reads these as a dashed overlay; committing (Seat) or clearing removes them.
 *
 * Scoped to one reservation at a time: previewing an option for a different
 * booking drops the previous booking's previews, so the overlay always reflects
 * a single party's comparison — no cross-booking clutter.
 */

/** Distinct accent hues so several previewed options read apart at a glance. */
export const PREVIEW_COLORS = [
  '#2563eb',
  '#c2410c',
  '#7c3aed',
  '#0d9488',
  '#be185d',
] as const

export interface SeatingPreview {
  /** The reservation this option would seat. */
  reservationId: ID
  /** The tables the option would occupy. */
  tableIds: ID[]
  /** Assigned accent color, distinct per active preview. */
  color: string
}

/** Stable identity of an option: its reservation + exact (order-free) table set. */
const keyOf = (reservationId: ID, tableIds: ID[]): string =>
  reservationId + '|' + [...tableIds].sort().join('+')

interface PreviewState {
  previews: SeatingPreview[]
  /**
   * Toggle one option's preview on/off. Adding an option for a different
   * reservation than the current previews drops them first (single-booking
   * scope). A fresh color is picked from `PREVIEW_COLORS`, reusing freed ones.
   */
  toggle: (reservationId: ID, tableIds: ID[]) => void
  /** Remove every preview. */
  clear: () => void
}

export const usePreviewStore = create<PreviewState>((set) => ({
  previews: [],

  toggle: (reservationId, tableIds) =>
    set((state) => {
      // Keep only this reservation's previews — switching bookings clears the rest.
      const scoped = state.previews.filter((p) => p.reservationId === reservationId)
      const key = keyOf(reservationId, tableIds)
      const existing = scoped.find((p) => keyOf(p.reservationId, p.tableIds) === key)
      if (existing) {
        return { previews: scoped.filter((p) => p !== existing) }
      }
      const used = new Set(scoped.map((p) => p.color))
      const color =
        PREVIEW_COLORS.find((c) => !used.has(c)) ??
        PREVIEW_COLORS[scoped.length % PREVIEW_COLORS.length]
      return { previews: [...scoped, { reservationId, tableIds, color }] }
    }),

  clear: () => set({ previews: [] }),
}))

/** Whether a specific option is currently previewed (order-free table match). */
export const isPreviewed = (
  previews: SeatingPreview[],
  reservationId: ID,
  tableIds: ID[],
): boolean => {
  const key = keyOf(reservationId, tableIds)
  return previews.some((p) => keyOf(p.reservationId, p.tableIds) === key)
}
