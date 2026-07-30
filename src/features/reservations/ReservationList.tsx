import { Text } from '@/components/ui'
import type { ID, Reservation } from '@/types'
import { ReservationCard } from './ReservationCard'

interface ReservationListProps {
  reservations: Reservation[]
  /** id → zone name, for showing preferred-zone labels without per-card lookups. */
  zoneNames: Map<ID, string>
  onEdit: (reservation: Reservation) => void
  onDelete: (id: string) => void
}

/** Scannable, time-ordered list of reservation cards. */
export function ReservationList({
  reservations,
  zoneNames,
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
      {reservations.map((r) => (
        <ReservationCard
          key={r.id}
          reservation={r}
          zoneName={r.preferredZoneId ? zoneNames.get(r.preferredZoneId) : undefined}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
