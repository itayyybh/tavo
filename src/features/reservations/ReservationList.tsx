import { Text } from '@/components/ui'
import type { ID, Reservation } from '@/types'
import { ReservationCard } from './ReservationCard'

export interface ZoneMeta {
  name: string
  color: string
}

interface ReservationListProps {
  reservations: Reservation[]
  /** id → zone name + color, for zone chips without per-card store lookups. */
  zoneMeta: Map<ID, ZoneMeta>
  /** Table id → label, for the reserved-table chip (Phase 7). */
  tableLabels?: Map<ID, string>
  /** Keyboard-selected reservation id, if any. */
  selectedId?: string
  onSelect?: (id: string) => void
  onEdit: (reservation: Reservation) => void
  onDelete: (id: string) => void
}

/** Scannable, time-ordered list of reservation cards. */
export function ReservationList({
  reservations,
  zoneMeta,
  tableLabels,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: ReservationListProps) {
  if (reservations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line py-16">
        <Text className="font-medium text-ink">No reservations</Text>
        <Text muted>Adjust filters or create a reservation to get started.</Text>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {reservations.map((r) => {
        const zone = r.preferredZoneId ? zoneMeta.get(r.preferredZoneId) : undefined
        const assignedLabel = r.assignedTableIds
          ?.map((id) => tableLabels?.get(id) ?? id)
          .join(' + ')
        return (
          <ReservationCard
            key={r.id}
            reservation={r}
            zoneName={zone?.name}
            zoneColor={zone?.color}
            assignedLabel={assignedLabel}
            selected={r.id === selectedId}
            onSelect={onSelect}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )
      })}
    </div>
  )
}
