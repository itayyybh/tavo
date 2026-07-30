import { Select } from '@/components/ui'
import { statusLabel, cn } from '@/utils'
import type { ReservationStatus } from '@/types'
import type { SelectOption } from '@/components/ui'
import type { DatePreset, ReservationFilterState } from './hooks/useReservationFilters'
import { ACTIVE_UI_STATUSES } from './constants'

export interface ZoneChoice {
  id: string
  name: string
  color: string
}

interface ReservationFiltersProps {
  state: ReservationFilterState
  patch: (partial: Partial<ReservationFilterState>) => void
  zones: ZoneChoice[]
}

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
]

const partyOptions: SelectOption[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
  value: String(n),
  label: `${n}${n === 8 ? '+' : ''}`,
}))

/** Filter bar — date presets, status chips, party size, zone. Presentational. */
export function ReservationFilters({ state, patch, zones }: ReservationFiltersProps) {
  const toggleStatus = (status: ReservationStatus) => {
    const has = state.statuses.includes(status)
    patch({
      statuses: has
        ? state.statuses.filter((s) => s !== status)
        : [...state.statuses, status],
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Date presets + optional custom day. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line p-0.5">
          {DATE_PRESETS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => patch({ preset: value })}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors duration-200',
                state.preset === value
                  ? 'bg-ink text-surface'
                  : 'text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {state.preset === 'custom' && (
          <input
            type="date"
            value={state.customDay}
            onChange={(e) => patch({ customDay: e.target.value })}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          />
        )}

        <span className="mx-1 h-4 w-px bg-line" />

        <div className="w-32">
          <Select
            options={partyOptions}
            placeholder="Any size"
            value={state.partySize == null ? '' : String(state.partySize)}
            onChange={(e) =>
              patch({ partySize: e.target.value ? Number(e.target.value) : null })
            }
            className="h-8"
          />
        </div>
      </div>

      {/* Zone buttons — tinted with each zone's editor color. */}
      {zones.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => patch({ preferredZoneId: '' })}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors duration-200',
              state.preferredZoneId === ''
                ? 'border-ink bg-ink text-surface'
                : 'border-line bg-surface text-muted hover:text-ink',
            )}
          >
            All zones
          </button>
          {zones.map((z) => {
            const active = state.preferredZoneId === z.id
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => patch({ preferredZoneId: active ? '' : z.id })}
                aria-pressed={active}
                style={{ backgroundColor: z.color }}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-medium text-neutral-900 transition-shadow duration-200',
                  active
                    ? 'border-ink ring-1 ring-ink'
                    : 'border-black/5 hover:ring-1 hover:ring-black/10',
                )}
              >
                {z.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Status chips. */}
      <div className="flex flex-wrap gap-1.5">
        {ACTIVE_UI_STATUSES.map((status) => {
          const active = state.statuses.includes(status)
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              aria-pressed={active}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors duration-200',
                active
                  ? 'border-ink bg-ink text-surface'
                  : 'border-line bg-surface text-muted hover:text-ink',
              )}
            >
              {statusLabel[status]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
