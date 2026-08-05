import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  RESERVATION_OCCASIONS,
  RESERVATION_SOURCES,
  RESERVATION_STATUSES,
} from '@/types'
import type {
  ReservationOccasion,
  ReservationSource,
  ReservationStatus,
} from '@/types'
import type { SelectOption } from '@/components/ui'
import { DURATION_VALUES } from '../constants'

/**
 * Translated reservation labels + <Select> options. Enum *membership* stays the
 * source of truth (from `@/types`); the display strings resolve against the
 * active locale, so everything re-renders when the language changes.
 */
export function useReservationLabels() {
  const { t } = useTranslation('reservations')

  return useMemo(() => {
    const status = (s: ReservationStatus) => t(`status.${s}`)
    const source = (s: ReservationSource) => t(`source.${s}`)
    const occasion = (o: ReservationOccasion) => t(`occasion.${o}`)

    const statusOptions: SelectOption[] = RESERVATION_STATUSES.map((s) => ({
      value: s,
      label: status(s),
    }))
    const sourceOptions: SelectOption[] = RESERVATION_SOURCES.map((s) => ({
      value: s,
      label: source(s),
    }))
    const occasionOptions: SelectOption[] = RESERVATION_OCCASIONS.map((o) => ({
      value: o,
      label: occasion(o),
    }))
    const durationOptions: SelectOption[] = DURATION_VALUES.map((v) => ({
      value: String(v),
      label: t(`duration.${v}`),
    }))

    return {
      status,
      source,
      occasion,
      statusOptions,
      sourceOptions,
      occasionOptions,
      durationOptions,
    }
  }, [t])
}
