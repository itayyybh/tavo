import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { bucketByTimeSlot, formatClock, cn } from '@/utils'
import type { Reservation } from '@/types'

interface ServiceLoadChartProps {
  /** Reservations to bucket (pre-slot-filter, so bars stay stable on selection). */
  reservations: Reservation[]
  /**
   * Total floor seating capacity. When > 0, bars are drawn as occupancy against
   * real capacity (free space = the remainder). When 0/undefined (no floor built
   * yet), bars fall back to relative-to-busiest-slot.
   */
  capacity?: number
  /** Currently selected slot start (minutes), or null. */
  activeStart: number | null
  /** Toggle a slot filter. Passing the active slot again clears it. */
  onSelect: (start: number | null) => void
}

/**
 * Compact service-load chart. One row per 30-min slot; bar width shows expected
 * occupancy against total floor capacity (or relative to the busiest slot when
 * capacity is unknown). Clicking a slot filters the list (click again to clear).
 */
export function ServiceLoadChart({
  reservations,
  capacity,
  activeStart,
  onSelect,
}: ServiceLoadChartProps) {
  const { t } = useTranslation('reservations')
  const slots = useMemo(() => bucketByTimeSlot(reservations), [reservations])
  // Scale bars against floor capacity when known (occupancy), else the busiest slot.
  const scale = useMemo(
    () => Math.max(1, capacity && capacity > 0 ? capacity : 0, ...slots.map((s) => s.guests)),
    [slots, capacity],
  )
  const useCapacity = (capacity ?? 0) > 0

  if (slots.length === 0) return null

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink">
          {t('loadChart.title')}
          {useCapacity && (
            <span className="ms-1 font-normal text-muted">
              · {t('loadChart.seats', { count: capacity })}
            </span>
          )}
        </span>
        {activeStart != null && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-[11px] text-muted transition-colors hover:text-ink"
          >
            {t('loadChart.clear')}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {slots.map((slot) => {
          const active = slot.start === activeStart
          const empty = slot.guests === 0
          const width = Math.min(100, (slot.guests / scale) * 100)
          const over = useCapacity && slot.guests > capacity!
          const free = useCapacity ? Math.max(0, capacity! - slot.guests) : 0
          return (
            <button
              key={slot.start}
              type="button"
              disabled={empty}
              title={
                t('loadChart.tooltip', {
                  count: slot.items.length,
                  guests: slot.guests,
                }) +
                (useCapacity
                  ? over
                    ? t('loadChart.over', { count: slot.guests - capacity! })
                    : t('loadChart.free', { count: free })
                  : '')
              }
              onClick={() => onSelect(active ? null : slot.start)}
              className={cn(
                'group flex items-center gap-2 rounded-md px-1 py-0.5 text-start transition-colors duration-200',
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
                    over
                      ? 'bg-status-occupied'
                      : active
                        ? 'bg-ink'
                        : 'bg-ink/60 group-hover:bg-ink/80',
                  )}
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className="w-4 shrink-0 text-end text-[11px] tabular-nums text-muted">
                {slot.guests}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
