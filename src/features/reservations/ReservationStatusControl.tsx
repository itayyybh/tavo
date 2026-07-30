import { useReservationStore } from '@/stores'
import { statusTransitions, statusLabel, cn } from '@/utils'
import type { ID, ReservationStatus } from '@/types'

interface ReservationStatusControlProps {
  id: ID
  status: ReservationStatus
  className?: string
}

/**
 * Compact status switcher — offers the current status plus only its valid next
 * states (see `statusTransitions`). Native select for speed + accessibility.
 */
export function ReservationStatusControl({
  id,
  status,
  className,
}: ReservationStatusControlProps) {
  const setStatus = useReservationStore((s) => s.setStatus)
  const choices: ReservationStatus[] = [status, ...statusTransitions[status]]

  return (
    <select
      aria-label="Change status"
      value={status}
      onChange={(e) => {
        const next = e.target.value as ReservationStatus
        if (next !== status) setStatus(id, next)
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'h-7 rounded-lg border border-line bg-surface px-2 text-xs font-medium text-ink-soft transition-colors duration-200 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20',
        className,
      )}
    >
      {choices.map((s) => (
        <option key={s} value={s}>
          {statusLabel[s]}
        </option>
      ))}
    </select>
  )
}
