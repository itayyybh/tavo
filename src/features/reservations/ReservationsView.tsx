import { useMemo, useState } from 'react'
import { Button, Heading, Input, Text } from '@/components/ui'
import { useLayoutStore } from '@/stores'
import type { ID, Reservation } from '@/types'
import { cn } from '@/utils'
import { useReservationPersistence } from './hooks/useReservationPersistence'
import { useReservationFilters } from './hooks/useReservationFilters'
import { ReservationFilters } from './ReservationFilters'
import { ReservationList, type ZoneMeta } from './ReservationList'
import { ReservationTimeline } from './ReservationTimeline'
import { ReservationDialog } from './ReservationDialog'
import { useReservationStore } from '@/stores'
import { buildSampleReservations } from './sampleData'

type ViewMode = 'list' | 'timeline'

/**
 * Reservation Engine surface — search, filter, list/timeline, and CRUD.
 * Reads the reservation store (+ zones as read-only config); no table coupling.
 */
export function ReservationsView() {
  useReservationPersistence()

  const zones = useLayoutStore((s) => s.zones)
  const removeReservation = useReservationStore((s) => s.removeReservation)
  const addReservation = useReservationStore((s) => s.addReservation)
  const { state, patch, results, total } = useReservationFilters()

  const seedSamples = () => {
    buildSampleReservations(zones.map((z) => z.id)).forEach(addReservation)
  }

  const [view, setView] = useState<ViewMode>('list')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Reservation | undefined>(undefined)

  const zoneOptions = useMemo(
    () => zones.map((z) => ({ value: z.id, label: z.name })),
    [zones],
  )
  const zoneMeta = useMemo<Map<ID, ZoneMeta>>(
    () => new Map(zones.map((z) => [z.id, { name: z.name, color: z.color }])),
    [zones],
  )

  const openCreate = () => {
    setEditing(undefined)
    setDialogOpen(true)
  }
  const openEdit = (reservation: Reservation) => {
    setEditing(reservation)
    setDialogOpen(true)
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      {/* Header. */}
      <div className="flex items-end justify-between">
        <div>
          <Heading level={1}>Reservations</Heading>
          <Text muted className="mt-1">
            {results.length} shown · {total} total
          </Text>
        </div>
        <div className="flex items-center gap-2">
          {import.meta.env.DEV && (
            <Button variant="secondary" onClick={seedSamples}>
              Seed 20
            </Button>
          )}
          <Button onClick={openCreate}>New reservation</Button>
        </div>
      </div>

      {/* Search + view toggle. */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            value={state.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="Search name, phone, or ID"
          />
        </div>
        <div className="inline-flex rounded-lg border border-line p-0.5">
          {(['list', 'timeline'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-200',
                view === mode ? 'bg-ink text-surface' : 'text-muted hover:text-ink',
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <ReservationFilters state={state} patch={patch} zoneOptions={zoneOptions} />

      {view === 'list' ? (
        <ReservationList
          reservations={results}
          zoneMeta={zoneMeta}
          onEdit={openEdit}
          onDelete={removeReservation}
        />
      ) : (
        <ReservationTimeline reservations={results} onEdit={openEdit} />
      )}

      <ReservationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
      />
    </div>
  )
}
