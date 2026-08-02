import { useMemo } from 'react'
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
  const s = useMemo(() => summarizeReservations(reservations), [reservations])

  const tiles: { label: string; value: string }[] = [
    { label: 'Reservations', value: `${s.count}` },
    { label: 'Guests', value: `${s.totalGuests}` },
    { label: 'Confirmed', value: `${s.confirmed}` },
    { label: 'Arrived', value: `${s.arrived}` },
    { label: 'VIP', value: `${s.vip}` },
    { label: 'Avg party', value: s.avgParty ? s.avgParty.toFixed(1) : '—' },
  ]

  return (
    <div className="flex divide-x divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {tiles.map((t) => (
        <div key={t.label} className="flex-1 px-4 py-2.5">
          <div className="text-lg font-semibold tabular-nums leading-tight text-ink">
            {t.value}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-muted">
            {t.label}
          </div>
        </div>
      ))}
    </div>
  )
}
