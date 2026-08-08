import { useCallback, useMemo } from 'react'
import { useReservationStore } from '@/stores'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { optimizeAssignments, suggestSeating } from '@/services/seating'
import type { SeatingFloor } from '@/services/seating'
import { combineDateTime, createId, seatsForTable, toDateKey } from '@/utils'
import type { NewReservation } from '@/stores/reservationStore'
import type { Reservation, Table } from '@/types'

/**
 * Dev-only demo (Phase 12, A1): plant a booking that fits ONLY after a repack,
 * so "Optimize" can be exercised deterministically.
 *
 * The naive version (park a small hold on a big table) fails on many floors —
 * the displaced hold may have nowhere to go, or the big party may fit directly
 * via a merge — leaving nothing to repack. So this VALIDATES against the real
 * floor: it scans zones for a (big table, spare small table) pair where the big
 * party has no direct fit yet a reshuffle seats it, and only then offers the
 * demo. `canDemo` is false when the current floor can't stage one.
 *
 * Best run on a cleared sheet — feasibility is checked for the demo pair in
 * isolation, so pre-existing bookings holding the spare table could still block
 * the repack at apply time.
 */
export function useRepackDemo() {
  const floor = useSeatingFloor()
  const reservations = useReservationStore((s) => s.reservations)
  const addReservation = useReservationStore((s) => s.addReservation)

  const demo = useMemo(
    () => stageRepackDemo(floor, reservations),
    [floor, reservations],
  )

  const seed = useCallback(() => demo?.forEach(addReservation), [demo, addReservation])

  return { seed, canDemo: !!demo }
}

const AT_8PM = () => combineDateTime(toDateKey(new Date()), '20:00')

/** A throwaway full reservation for feasibility probing (never stored). */
const probe = (partySize: number, over: Partial<Reservation>): Reservation => {
  const at = AT_8PM()
  return {
    id: createId(),
    guestName: 'probe',
    partySize,
    dateTime: at,
    estimatedDuration: 120,
    status: 'confirmed',
    source: 'manual',
    createdAt: at,
    updatedAt: at,
    ...over,
  }
}

/**
 * Find a zone where a big party can be seated only by reshuffling a small hold,
 * and return the two demo bookings to create — or null if the floor can't stage
 * one.
 */
function stageRepackDemo(
  floor: SeatingFloor,
  existing: Reservation[],
): NewReservation[] | null {
  const cap = (t: Table) =>
    seatsForTable(t, floor.tableTypes.find((ty) => ty.id === t.typeId))

  // Stage the demo only in a real dining zone: skip nested zones (e.g. a Bar
  // inside another zone) and zones taken out of booking rotation.
  const zones = floor.zones.filter((z) => !z.parentId && z.bookable !== false)

  for (const zone of zones) {
    const zoneTables = floor.tables
      .filter((t) => t.zoneId === zone.id)
      .sort((a, b) => cap(b) - cap(a))
    if (zoneTables.length < 2) continue

    const bigT = zoneTables[0]
    const bigSize = cap(bigT)
    if (bigSize < 3) continue

    // The spare must seat a party of 2 WITHIN the under-fill slack, or the
    // displaced hold couldn't legally move onto it.
    const maxSpare = 2 + floor.config.maxUnderfill
    const spare = zoneTables.find(
      (t) => t.id !== bigT.id && cap(t) >= 2 && cap(t) <= maxSpare,
    )
    if (!spare) continue

    // Occupy every table EXCEPT the spare with a small auto hold. With only the
    // (too-small) spare left free the big party has no direct fit — the sole way
    // in is to relocate the hold off bigT onto the spare, freeing bigT. Holding
    // the rest is what blocks a lucky direct single/merge fit.
    const blocked = zoneTables.filter((t) => t.id !== spare.id)
    const holds = blocked.map((t) =>
      probe(2, {
        preferredZoneId: zone.id,
        assignedTableIds: [t.id],
        assignmentSource: 'auto',
      }),
    )
    const party = probe(bigSize, { preferredZoneId: zone.id })

    // Must have NO direct fit (mirrors planSheetRepack) yet a valid repack —
    // checked against the LIVE sheet so the demo works given current bookings.
    if (suggestSeating(party, floor, [...existing, ...holds]).length > 0) continue
    const plan = optimizeAssignments(party, floor, [...existing, ...holds, party])
    if (!plan?.moves.some((m) => m.reservationId === party.id)) continue

    const base = {
      estimatedDuration: 120,
      preferredZoneId: zone.id,
      status: 'confirmed' as const,
      source: 'manual' as const,
    }
    return [
      ...blocked.map((t, i) => ({
        ...base,
        guestName: `Repack demo — hold ${i + 1}`,
        partySize: 2,
        dateTime: holds[i].dateTime,
        assignedTableIds: [t.id],
        assignmentSource: 'auto' as const,
      })),
      {
        ...base,
        guestName: 'Repack demo — big party',
        partySize: bigSize,
        dateTime: party.dateTime,
      },
    ]
  }
  return null
}
