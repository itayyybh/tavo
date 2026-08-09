import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, ReservationStatusBadge } from '@/components/ui'
import { formatTime, cn } from '@/utils'
import type { Reservation } from '@/types'
import { ReservationStatusControl } from './ReservationStatusControl'
import { Countdown } from './Countdown'
import { useReservationLabels } from './hooks/useReservationLabels'

interface ReservationCardProps {
  reservation: Reservation
  /** Resolved preferred-zone name, if any (looked up by the list to avoid per-card subscriptions). */
  zoneName?: string
  /** Zone's editor color (hex) — used as the zone chip background. */
  zoneColor?: string
  /** Reserved table label(s), if the reservation has a seating assignment (Phase 7). */
  assignedLabel?: string
  /** Whether this row is the keyboard-selected one. */
  selected?: boolean
  onSelect?: (id: string) => void
  onEdit: (reservation: Reservation) => void
  onDelete: (id: string) => void
}

function ReservationCardBase({
  reservation,
  zoneName,
  zoneColor,
  assignedLabel,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: ReservationCardProps) {
  const { t } = useTranslation('reservations')
  const labels = useReservationLabels()
  const { guestName, partySize, dateTime, status, occasion, preferences, source } =
    reservation
  const vip = preferences?.vip

  return (
    <div
      data-reservation-id={reservation.id}
      onClick={() => onSelect?.(reservation.id)}
      onDoubleClick={() => onEdit(reservation)}
      className={cn(
        'group flex items-center gap-4 rounded-xl border bg-surface px-4 py-3 transition-colors duration-200 hover:bg-surface-2',
        selected ? 'border-ink ring-1 ring-ink' : 'border-line',
      )}
    >
      {/* Arrival time — the primary scanning anchor — with a live countdown. */}
      <div className="w-20 shrink-0">
        <div className="text-sm font-semibold tabular-nums text-ink">
          {formatTime(dateTime)}
        </div>
        <Countdown dateTime={dateTime} status={status} className="mt-0.5 block" />
      </div>

      {/* Identity + meta. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{guestName}</span>
          {vip && (
            <span className="rounded-full bg-reservation-waitlist/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-reservation-waitlist">
              VIP
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span className="tabular-nums">{t('card.guest', { count: partySize })}</span>
          {source === 'whatsapp' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-black/5 bg-[#25D366]/15 px-2 py-0.5 text-[10px] font-medium text-neutral-900">
              <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden>
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.004c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.94 1.34-.5.05-1.12.24-3.66-.77-3.08-1.21-5.05-4.34-5.2-4.54-.15-.2-1.24-1.65-1.24-3.15 0-1.5.79-2.24 1.07-2.54.28-.3.61-.38.81-.38.2 0 .4 0 .58.01.19.01.44-.07.68.52.24.6.83 2.07.9 2.22.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.45.3.15.47.12.65-.07.18-.2.75-.87.95-1.17.2-.3.4-.25.68-.15.28.1 1.76.83 2.06.98.3.15.5.22.58.35.07.13.07.72-.17 1.4Z" />
              </svg>
              {labels.source('whatsapp')}
            </span>
          )}
          {zoneName && (
            <span
              className="rounded-full border border-black/5 px-2 py-0.5 text-[10px] font-medium text-neutral-900"
              style={zoneColor ? { backgroundColor: zoneColor } : undefined}
            >
              {zoneName}
            </span>
          )}
          {occasion && (
            <>
              <span className="text-line">·</span>
              <span>{labels.occasion(occasion)}</span>
            </>
          )}
          {assignedLabel && (
            <span className="rounded-full border border-ink/15 bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink">
              {assignedLabel}
            </span>
          )}
        </div>
      </div>

      {/* Status + actions. */}
      <div className="flex shrink-0 items-center gap-2">
        <ReservationStatusBadge status={status} />
        <ReservationStatusControl id={reservation.id} status={status} />
        <div className="hover-reveal flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onEdit(reservation)}>
            {t('card.edit')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(reservation.id)}>
            {t('card.delete')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export const ReservationCard = memo(ReservationCardBase)
