import { useTranslation } from 'react-i18next'
import { cn } from '@/utils'
import type { ReservationStatus } from '@/types'

// Literal classes so Tailwind statically detects them (mirrors StatusBadge).
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

/** Reservation status pill — single source of truth for status → color/label. */
export function ReservationStatusBadge({
  status,
  className,
}: {
  status: ReservationStatus
  className?: string
}) {
  const { t } = useTranslation('reservations')
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-soft',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[status])} />
      {t(`status.${status}`)}
    </span>
  )
}
