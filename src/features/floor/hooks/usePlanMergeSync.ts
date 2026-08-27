import { useEffect } from 'react'
import {
  useFloorPlanStore,
  usePlanFloorStore,
  useReservationStore,
  isPlanning,
} from '@/stores'
import { isActiveStatus, isOnDay } from '@/utils'

/**
 * Keep the plan day's arrangement in step with its bookings: every still-active
 * multi-table booking on the viewed day gets a plan merge (which snaps its tables
 * together) so connected tables draw as one body the way they'll actually be set,
 * and a merge whose booking was unplanned or re-tabled is dropped (otherwise it
 * lingers as an orphaned blank table). Host-made merges are left alone.
 *
 * Persisting the merge (rather than deriving it) is deliberate — the stored
 * override then matches exactly what's displayed, so dragging or rotating the
 * block never drifts against a phantom auto-position. The reconcile is a no-op
 * when already in sync, and depends only on the bookings, so it can't loop.
 */
export function usePlanMergeSync() {
  const reservations = useReservationStore((s) => s.reservations)
  const viewDate = useFloorPlanStore((s) => s.viewDate)
  const planning = useFloorPlanStore(isPlanning)
  const syncBookingMerges = usePlanFloorStore((s) => s.syncBookingMerges)

  useEffect(() => {
    if (!planning) return
    const bookings = reservations
      .filter(
        (r) =>
          isActiveStatus(r.status) &&
          isOnDay(r.dateTime, viewDate) &&
          (r.assignedTableIds?.length ?? 0) > 1,
      )
      .map((r) => ({ id: r.id, tableIds: r.assignedTableIds ?? [] }))
    syncBookingMerges(viewDate, bookings)
  }, [planning, viewDate, reservations, syncBookingMerges])
}
