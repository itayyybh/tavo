import { FloorCanvas, FloorEmptyState } from '@/features/floor'
import { FloorReservationRail } from '@/features/floor/FloorReservationRail'
import { useLayoutStore } from '@/stores'

/**
 * Live Floor — top-down operational view of the restaurant (Phase 8).
 * The canvas renders the effective floor (base layout + runtime shift overrides);
 * the right rail seats upcoming bookings and clears seated parties.
 */
export default function FloorPage() {
  // A hydrated-but-empty layout means a fresh restaurant — nothing to run yet.
  const hydrated = useLayoutStore((s) => s.hydrated)
  const isEmpty = useLayoutStore((s) => s.tables.length === 0 && s.zones.length === 0)

  if (hydrated && isEmpty) return <FloorEmptyState />

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <FloorCanvas />
      </div>
      <FloorReservationRail />
    </div>
  )
}
