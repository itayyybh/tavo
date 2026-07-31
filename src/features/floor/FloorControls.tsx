import type { Zone, FloorTableStatus } from '@/types'
import type { FloorSummary } from '@/services/floor'
import { statusLabel } from './status'

interface FloorControlsProps {
  zones: Zone[]
  focusedZoneId: string | null
  onFocusZone: (id: string | null) => void
  summary: FloorSummary
  onFit: () => void
  onRestoreDefault: () => void
  autoTurnover: boolean
  onToggleAutoTurnover: () => void
}

/** Status pills shown in the occupancy legend, in reading order. */
const LEGEND: FloorTableStatus[] = [
  'available',
  'reserved',
  'occupied',
  'cleaning',
  'blocked',
]

const chip =
  'rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap'

/**
 * Live Floor header: zone focus on the left (All + one chip per zone), an
 * occupancy legend + fit-to-content on the right. Focus reuses the shared
 * `uiStore.focusedZoneId`, so the canvas isolates that zone.
 */
export function FloorControls({
  zones,
  focusedZoneId,
  onFocusZone,
  summary,
  onFit,
  onRestoreDefault,
  autoTurnover,
  onToggleAutoTurnover,
}: FloorControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2">
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
        <button
          onClick={() => onFocusZone(null)}
          className={`${chip} ${
            focusedZoneId === null
              ? 'border-ink bg-ink text-surface'
              : 'border-line text-muted hover:text-ink'
          }`}
        >
          All zones
        </button>
        {zones.map((zone) => {
          const active = focusedZoneId === zone.id
          return (
            <button
              key={zone.id}
              onClick={() => onFocusZone(zone.id)}
              className={`${chip} flex items-center gap-1.5 ${
                active ? 'border-ink text-ink' : 'border-line text-muted hover:text-ink'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: zone.color }}
              />
              {zone.name}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          {LEGEND.map((status) => (
            <span
              key={status}
              className="flex items-center gap-1.5 text-xs text-muted"
              title={statusLabel[status]}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: `var(--color-status-${status})` }}
              />
              {summary.counts[status]}
            </span>
          ))}
        </div>
        <span className="hidden text-xs text-muted sm:inline">
          {summary.occupiedSeats}/{summary.totalSeats} seats
        </span>
        <button
          onClick={onToggleAutoTurnover}
          title="Auto-return cleaning tables to available after the turnover buffer"
          className={`${chip} ${
            autoTurnover
              ? 'border-ink text-ink'
              : 'border-line text-muted hover:text-ink'
          }`}
        >
          Auto-turnover {autoTurnover ? 'on' : 'off'}
        </button>
        <button
          onClick={onRestoreDefault}
          title="Reset all tables to their base layout position, rotation and merges"
          className={`${chip} border-line text-muted hover:text-ink`}
        >
          Reset layout
        </button>
        <button
          onClick={onFit}
          className={`${chip} border-line text-muted hover:text-ink`}
        >
          Fit
        </button>
      </div>
    </div>
  )
}
