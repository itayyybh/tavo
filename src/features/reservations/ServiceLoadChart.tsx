import { useMemo } from 'react'
import { bucketByTimeSlot, formatClock, cn } from '@/utils'
import type { Reservation } from '@/types'

interface ServiceLoadChartProps {
  /** Reservations to bucket (pre-slot-filter, so bars stay stable on selection). */
  reservations: Reservation[]
  /** Currently selected slot start (minutes), or null. */
  activeStart: number | null
  /** Toggle a slot filter. Passing the active slot again clears it. */
  onSelect: (start: number | null) => void
}

/**
 * Compact service-load chart. One row per 30-min slot, bar width ∝ guests.
 * Clicking a slot filters the list to that slot (click again to clear).
 */
export function ServiceLoadChart({
  reservations,
  activeStart,
  onSelect,
}: ServiceLoadChartProps) {
  const slots = useMemo(() => bucketByTimeSlot(reservations), [reservations])
  const maxGuests = useMemo(
    () => Math.max(1, ...slots.map((s) => s.guests)),
    [slots],
  )

  if (slots.length === 0) return null

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink">Service load</span>
        {activeStart != null && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-[11px] text-muted transition-colors hover:text-ink"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {slots.map((slot) => {
          const active = slot.start === activeStart
          const empty = slot.guests === 0
          return (
            <button
              key={slot.start}
              type="button"
              disabled={empty}
              onClick={() => onSelect(active ? null : slot.start)}
              className={cn(
                'group flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors duration-200',
                active ? 'bg-surface-2' : 'hover:bg-surface-2',
                empty && 'cursor-default opacity-50',
              )}
            >
              <span
                className={cn(
                  'w-10 shrink-0 text-[11px] tabular-nums',
                  active ? 'font-semibold text-ink' : 'text-muted',
                )}
              >
                {formatClock(slot.start)}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className={cn(
                    'block h-full rounded-full transition-all duration-200',
                    active ? 'bg-ink' : 'bg-ink/60 group-hover:bg-ink/80',
                  )}
                  style={{ width: `${(slot.guests / maxGuests) * 100}%` }}
                />
              </span>
              <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted">
                {slot.items.length}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
