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
  const { guestName, partySize, dateTime, status, occasion, preferences } = reservation
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
