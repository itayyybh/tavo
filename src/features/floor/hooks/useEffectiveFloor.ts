import { useMemo } from 'react'
import {
  useFloorStore,
  useFloorPlanStore,
  usePlanFloorStore,
  usePreviewStore,
  useReservationStore,
  useSettingsStore,
  isPlanning,
  type PlanArrangement,
} from '@/stores'
import type { FloorSnapshot } from '@/types'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { deriveFloorState, type EffectiveFloor } from '@/services/floor'

/**
 * A plan day's arrangement, as the `FloorSnapshot` the derivation consumes: the
 * host's own moves/rotations/merges for that day — no live seatings or status
 * overrides. Multi-table bookings are pushed together + merged by
 * `usePlanMergeSync`, which writes real overrides here, so what's displayed and
 * what's stored stay in lockstep (drag/rotate math never drifts).
 */
function planSnapshot(arrangement: PlanArrangement): FloorSnapshot {
  return {
    seatings: [],
    runtimeMerges: arrangement.merges,
    statusOverrides: {},
    cleaningSince: {},
    positionOverrides: arrangement.positionOverrides,
    rotationOverrides: arrangement.rotationOverrides,
  }
}

/**
 * Assemble the effective Live Floor the renderer draws: base layout (via
 * `useSeatingFloor`) + reservations + the runtime override layer (`floorStore`),
 * combined by the pure `deriveFloorState`. Memoized on the underlying slices so it
 * only recomputes when the floor, the shift, or the bookings actually change. The
 * single bridge the Live Floor UI reads — the derivation itself stays store-free.
 *
 * In plan mode it swaps the live shift for the chosen day's plan snapshot
 * (`buildPlanSnapshot`): that day's assigned bookings become `reserved`, and its
 * own arrangement (moves/rotations/merges) drives positions — the live floor is
 * never touched.
 */
export function useEffectiveFloor(): EffectiveFloor {
  const { tables } = useSeatingFloor()
  const reservations = useReservationStore((s) => s.reservations)
  const seatings = useFloorStore((s) => s.seatings)
  const runtimeMerges = useFloorStore((s) => s.runtimeMerges)
  const statusOverrides = useFloorStore((s) => s.statusOverrides)
  const cleaningSince = useFloorStore((s) => s.cleaningSince)
  const positionOverrides = useFloorStore((s) => s.positionOverrides)
  const rotationOverrides = useFloorStore((s) => s.rotationOverrides)
  const reservedLookaheadMin = useSettingsStore((s) => s.reservedLookaheadMin)
  const turnoverBufferMin = useSettingsStore((s) => s.seating.turnoverBufferMin)
  const previews = usePreviewStore((s) => s.previews)
  // Plan mode: derive the chosen day's plan instead of the live floor.
  const viewDate = useFloorPlanStore((s) => s.viewDate)
  const planning = useFloorPlanStore(isPlanning)
  const planArrangement = usePlanFloorStore((s) => s.byDay[viewDate])
  const planDate = planning ? viewDate : undefined

  return useMemo(() => {
    const snapshot: FloorSnapshot = planDate
      ? planSnapshot(planArrangement ?? EMPTY_ARRANGEMENT)
      : {
          seatings,
          runtimeMerges,
          statusOverrides,
          cleaningSince,
          positionOverrides,
          rotationOverrides,
        }
    return deriveFloorState({
      tables,
      reservations,
      snapshot,
      reservedLookaheadMin,
      turnoverBufferMin,
      previews,
      planDate,
    })
  }, [
    tables,
    reservations,
    seatings,
    runtimeMerges,
    statusOverrides,
    cleaningSince,
    positionOverrides,
    rotationOverrides,
    reservedLookaheadMin,
    turnoverBufferMin,
    previews,
    planDate,
    planArrangement,
  ])
}

const EMPTY_ARRANGEMENT: PlanArrangement = {
  positionOverrides: {},
  rotationOverrides: {},
  merges: [],
}
