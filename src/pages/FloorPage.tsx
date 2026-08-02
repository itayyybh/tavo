import { FloorCanvas } from '@/features/floor'
import { FloorReservationRail } from '@/features/floor/FloorReservationRail'

/**
 * Live Floor — top-down operational view of the restaurant (Phase 8).
 * The canvas renders the effective floor (base layout + runtime shift overrides);
 * the right rail seats upcoming bookings and clears seated parties.
 */
export default function FloorPage() {
  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <FloorCanvas />
      </div>
      <FloorReservationRail />
    </div>
  )
}
