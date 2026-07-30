import {
  RESERVATION_OCCASIONS,
  RESERVATION_SOURCES,
  RESERVATION_STATUSES,
} from '@/types'
import type { ReservationStatus } from '@/types'
import type { SelectOption } from '@/components/ui'
import { occasionLabel, sourceLabel, statusLabel } from '@/utils'

/**
 * Static option lists for reservation form/filter selects. Derived from the
 * type unions + label maps so they never drift out of sync.
 */

export const statusOptions: SelectOption[] = RESERVATION_STATUSES.map((s) => ({
  value: s,
  label: statusLabel[s],
}))

/**
 * Statuses surfaced in the UI right now. The data model keeps all 8 for Phase 7,
 * but hosts currently only work with Confirmed (auto on creation) and Arrived.
 */
export const ACTIVE_UI_STATUSES: ReservationStatus[] = ['confirmed', 'arrived']

export const sourceOptions: SelectOption[] = RESERVATION_SOURCES.map((s) => ({
  value: s,
  label: sourceLabel[s],
}))

export const occasionOptions: SelectOption[] = RESERVATION_OCCASIONS.map((o) => ({
  value: o,
  label: occasionLabel[o],
}))

/** Common service durations (minutes). Configurable — not restaurant rules. */
export const durationOptions: SelectOption[] = [
  { value: '60', label: '1 hr' },
  { value: '90', label: '1.5 hr' },
  { value: '120', label: '2 hr' },
  { value: '150', label: '2.5 hr' },
  { value: '180', label: '3 hr' },
]

export const DEFAULT_DURATION = 90
export const DEFAULT_PARTY_SIZE = 2
