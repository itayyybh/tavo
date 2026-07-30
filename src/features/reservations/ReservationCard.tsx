import { memo } from 'react'
import { Button, ReservationStatusBadge } from '@/components/ui'
import { formatTime, occasionLabel } from '@/utils'
import type { Reservation } from '@/types'
import { ReservationStatusControl } from './ReservationStatusControl'

interface ReservationCardProps {
  reservation: Reservation
  /** Resolved preferred-zone name, if any (looked up by the list to avoid per-card subscriptions). */
  zoneName?: string
  onEdit: (reservation: Reservation) => void
  onDelete: (id: string) => void
}

function ReservationCardBase({
  reservation,
  zoneName,
  onEdit,
  onDelete,
}: ReservationCardProps) {
  const { guestName, partySize, dateTime, status, occasion, preferences } = reservation
  const vip = preferences?.vip

  return (
    <div
      className="group flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 transition-colors duration-200 hover:bg-surface-2"
      onDoubleClick={() => onEdit(reservation)}
    >
      {/* Arrival time — the primary scanning anchor. */}
      <div className="w-16 shrink-0 text-sm font-semibold tabular-nums text-ink">
        {formatTime(dateTime)}
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
          <span className="tabular-nums">
            {partySize} {partySize === 1 ? 'guest' : 'guests'}
          </span>
          {zoneName && (
            <>
              <span className="text-line">·</span>
              <span>{zoneName}</span>
            </>
          )}
          {occasion && (
            <>
              <span className="text-line">·</span>
              <span>{occasionLabel[occasion]}</span>
            </>
          )}
        </div>
      </div>

      {/* Status + actions. */}
      <div className="flex shrink-0 items-center gap-2">
        <ReservationStatusBadge status={status} />
        <ReservationStatusControl id={reservation.id} status={status} />
        <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <Button size="sm" variant="ghost" onClick={() => onEdit(reservation)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(reservation.id)}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

export const ReservationCard = memo(ReservationCardBase)
