import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { summarizeReservations } from '@/utils'
import type { Reservation } from '@/types'

interface ReservationSummaryProps {
  /** The currently visible (filtered) reservations. */
  reservations: Reservation[]
}

/**
 * Compact service dashboard — headline metrics for the current selection.
 * Answers "how busy is it right now?" in one glance, minimal vertical space.
 */
export function ReservationSummary({ reservations }: ReservationSummaryProps) {
  const { t } = useTranslation('reservations')
  const s = useMemo(() => summarizeReservations(reservations), [reservations])

  const tiles: { label: string; value: string }[] = [
    { label: t('summary.reservations'), value: `${s.count}` },
    { label: t('summary.guests'), value: `${s.totalGuests}` },
    { label: t('summary.confirmed'), value: `${s.confirmed}` },
    { label: t('summary.arrived'), value: `${s.arrived}` },
    { label: t('summary.vip'), value: `${s.vip}` },
    { label: t('summary.avgParty'), value: s.avgParty ? s.avgParty.toFixed(1) : '—' },
  ]

  return (
    <div className="flex divide-x divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex-1 px-4 py-2.5">
          <div className="text-lg font-semibold tabular-nums leading-tight text-ink">
            {tile.value}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-muted">
            {tile.label}
          </div>
        </div>
      ))}
    </div>
  )
}
