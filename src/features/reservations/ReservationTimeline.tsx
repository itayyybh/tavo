import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui'
import { bucketByTimeSlot, formatClock, cn } from '@/utils'
import type { Reservation, ReservationStatus } from '@/types'

interface ReservationTimelineProps {
  reservations: Reservation[]
  onEdit: (reservation: Reservation) => void
}

// Status dot colors (literal classes so Tailwind detects them).
const dotClass: Record<ReservationStatus, string> = {
  pending: 'bg-reservation-pending',
  confirmed: 'bg-reservation-confirmed',
  arrived: 'bg-reservation-arrived',
  seated: 'bg-reservation-seated',
  completed: 'bg-reservation-completed',
  cancelled: 'bg-reservation-cancelled',
  no_show: 'bg-reservation-no_show',
  waitlist: 'bg-reservation-waitlist',
}

/**
 * Chronological day view. Buckets reservations into 30-minute slots and shows a
 * load bar per slot so the host can see where service is heavy. No tables (Phase 7).
 */
export function ReservationTimeline({ reservations, onEdit }: ReservationTimelineProps) {
  const { t } = useTranslation('reservations')
  const slots = useMemo(() => bucketByTimeSlot(reservations), [reservations])

  const maxGuests = useMemo(() => Math.max(1, ...slots.map((s) => s.guests)), [slots])

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line py-16">
        <Text className="font-medium text-ink">{t('timeline.emptyTitle')}</Text>
        <Text muted>{t('timeline.emptyBody')}</Text>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {slots.map((slot) => (
        <div
          key={slot.start}
          className="flex gap-4 border-t border-line py-2 first:border-t-0"
        >
          <div className="w-14 shrink-0 pt-1 text-xs font-semibold tabular-nums text-muted">
            {formatClock(slot.start)}
          </div>
          <div className="min-w-0 flex-1">
            {/* Load bar. */}
            <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-ink/70 transition-all duration-200"
                style={{ width: `${(slot.guests / maxGuests) * 100}%` }}
              />
            </div>
            {/* Reservation chips. */}
            <div className="flex flex-wrap gap-1.5">
              {slot.items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onEdit(r)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-ink transition-colors duration-200 hover:bg-surface-2"
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[r.status])} />
                  <span className="font-medium">{r.guestName}</span>
                  <span className="tabular-nums text-muted">·{r.partySize}</span>
                </button>
              ))}
              {slot.items.length === 0 && <span className="text-xs text-line">—</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
