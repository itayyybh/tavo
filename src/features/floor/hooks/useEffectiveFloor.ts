import { useMemo } from 'react'
import { useFloorStore, useReservationStore } from '@/stores'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { deriveFloorState, type EffectiveFloor } from '@/services/floor'

/**
 * Assemble the effective Live Floor the renderer draws: base layout (via
 * `useSeatingFloor`) + reservations + the runtime override layer (`floorStore`),
 * combined by the pure `deriveFloorState`. Memoized on the underlying slices so it
 * only recomputes when the floor, the shift, or the bookings actually change. The
 * single bridge the Live Floor UI reads — the derivation itself stays store-free.
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

  return useMemo(
    () =>
      deriveFloorState({
        tables,
        reservations,
        snapshot: {
          seatings,
          runtimeMerges,
          statusOverrides,
          cleaningSince,
          positionOverrides,
          rotationOverrides,
        },
      }),
    [
      tables,
      reservations,
      seatings,
      runtimeMerges,
      statusOverrides,
      cleaningSince,
      positionOverrides,
      rotationOverrides,
    ],
  )
}
