import type { ReservationStatus } from '@/types'

/**
 * Static, locale-independent reservation data. Human-readable labels live in the
 * i18n `reservations` namespace and are resolved via `useReservationLabels()`,
 * so nothing here holds display text.
 */

/**
 * Statuses surfaced in the UI right now. The data model keeps all 8 for Phase 7,
 * but hosts currently only work with Confirmed (auto on creation) and Arrived.
 */
export const ACTIVE_UI_STATUSES: ReservationStatus[] = ['confirmed', 'arrived']

/** Common service durations (minutes). Configurable — not restaurant rules. */
export const DURATION_VALUES = [60, 90, 120, 150, 180] as const

export const DEFAULT_DURATION = 90
export const DEFAULT_PARTY_SIZE = 2
