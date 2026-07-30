import { useMemo, useState } from 'react'
import { useReservationStore } from '@/stores'
import {
  filterReservations,
  matchesQuery,
  sortReservations,
  todayKey,
  tomorrowKey,
} from '@/utils'
import type { ID, Reservation, ReservationStatus } from '@/types'

export type DatePreset = 'today' | 'tomorrow' | 'all' | 'custom'

export interface ReservationFilterState {
  query: string
  preset: DatePreset
  /** `YYYY-MM-DD` used only when preset === 'custom'. */
  customDay: string
  statuses: ReservationStatus[]
  preferredZoneId: ID | ''
  partySize: number | null
}

const DEFAULT_STATE: ReservationFilterState = {
  query: '',
  preset: 'today',
  customDay: '',
  statuses: [],
  preferredZoneId: '',
  partySize: null,
}

function resolveDayKey(state: ReservationFilterState): string | undefined {
  switch (state.preset) {
    case 'all':
      return undefined
    case 'today':
      return todayKey()
    case 'tomorrow':
      return tomorrowKey()
    case 'custom':
      return state.customDay || undefined
  }
}

interface UseReservationFilters {
  state: ReservationFilterState
  patch: (partial: Partial<ReservationFilterState>) => void
  /** Filtered + searched + time-sorted list, memoized. */
  results: Reservation[]
  /** Total reservations before filtering (for empty-state messaging). */
  total: number
}

/**
 * Owns reservation filter/search/sort state and derives the visible list.
 * Pure selection logic lives in `@/utils`; this hook only wires state to it.
 */
export function useReservationFilters(): UseReservationFilters {
  const reservations = useReservationStore((s) => s.reservations)
  const [state, setState] = useState<ReservationFilterState>(DEFAULT_STATE)

  const patch = (partial: Partial<ReservationFilterState>) =>
    setState((s) => ({ ...s, ...partial }))

  const results = useMemo(() => {
    const dayKey = resolveDayKey(state)
    const filtered = filterReservations(reservations, {
      dayKey,
      statuses: state.statuses,
      preferredZoneId: state.preferredZoneId || undefined,
      partySize: state.partySize ?? undefined,
    })
    const searched = filtered.filter((r) => matchesQuery(r, state.query))
    return sortReservations(searched, 'time', 'asc')
  }, [reservations, state])

  return { state, patch, results, total: reservations.length }
}
