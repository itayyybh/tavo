import { useCallback, useEffect, useMemo } from 'react'
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

  const result = useMemo(
    () => stageRepackDemo(floor, reservations),
    [floor, reservations],
  )

  // Surface WHY the demo can't be staged — the tooltip is terse, so log the full
  // per-zone breakdown for debugging.
  useEffect(() => {
    if (import.meta.env.DEV && !result.news) {
      console.warn('[repack demo] cannot stage:', result.reason)
    }
  }, [result])

  const seed = useCallback(
    () => result.news?.forEach(addReservation),
    [result, addReservation],
  )

  return {
    seed,
    canDemo: !!result.news,
    reason: result.news ? '' : result.reason,
  }
}

/** Either the bookings to seed, or the reason no floor zone could stage a demo. */
type DemoResult = { news: NewReservation[] } | { news: null; reason: string }

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
): DemoResult {
  const cap = (t: Table) =>
    seatsForTable(t, floor.tableTypes.find((ty) => ty.id === t.typeId))

  // Stage the demo only in a real dining zone: skip nested zones (e.g. a Bar
  // inside another zone) and zones taken out of booking rotation.
  const zones = floor.zones.filter((z) => !z.parentId && z.bookable !== false)
  if (zones.length === 0) {
    return { news: null, reason: 'No bookable top-level dining zone on this floor.' }
  }

  const notes: string[] = []
  const maxSpare = 2 + floor.config.maxUnderfill

  for (const zone of zones) {
    const zoneTables = floor.tables
      .filter((t) => t.zoneId === zone.id)
      .sort((a, b) => cap(b) - cap(a))
    if (zoneTables.length < 2) {
      notes.push(`${zone.name}: needs ≥2 tables (has ${zoneTables.length})`)
      continue
    }

    const bigT = zoneTables[0]
    const bigSize = cap(bigT)
    if (bigSize < 3) {
      notes.push(`${zone.name}: largest table seats only ${bigSize}`)
      continue
    }

    // The spare must seat a party of 2 WITHIN the under-fill slack, or the
    // displaced hold couldn't legally move onto it.
    const spare = zoneTables.find(
      (t) => t.id !== bigT.id && cap(t) >= 2 && cap(t) <= maxSpare,
    )
    if (!spare) {
      notes.push(`${zone.name}: no small spare table (seats 2–${maxSpare})`)
      continue
    }

    // Occupy every table EXCEPT the spare with an auto hold. Each hold is sized
    // to its OWN table so it can legally sit there (and won't need to move) —
    // except the hold on bigT, which is a party of 2 so it can relocate onto the
    // small spare. With only the (too-small) spare free the big party has no
    // direct fit; the one move is bigT's hold → spare, which frees bigT.
    const holdSize = (t: Table) => (t.id === bigT.id ? 2 : cap(t))
    const blocked = zoneTables.filter((t) => t.id !== spare.id)
    const holds = blocked.map((t) =>
      probe(holdSize(t), {
        preferredZoneId: zone.id,
        assignedTableIds: [t.id],
        assignmentSource: 'auto',
      }),
    )
    const party = probe(bigSize, { preferredZoneId: zone.id })

    // Must have NO direct fit (mirrors planSheetRepack) yet a valid repack —
    // checked against the LIVE sheet so the demo works given current bookings.
    if (suggestSeating(party, floor, [...existing, ...holds]).length > 0) {
      notes.push(`${zone.name}: party of ${bigSize} still fits directly`)
      continue
    }
    const plan = optimizeAssignments(party, floor, [...existing, ...holds, party])
    if (!plan?.moves.some((m) => m.reservationId === party.id)) {
      notes.push(`${zone.name}: no valid repack (displaced holds can't relocate)`)
      continue
    }

    const base = {
      estimatedDuration: 120,
      preferredZoneId: zone.id,
      status: 'confirmed' as const,
      source: 'manual' as const,
    }
    return {
      news: [
        ...blocked.map((t, i) => ({
          ...base,
          guestName: `Repack demo — hold ${i + 1}`,
          partySize: holdSize(t),
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
      ],
    }
  }
  return { news: null, reason: notes.join(' · ') }
}
