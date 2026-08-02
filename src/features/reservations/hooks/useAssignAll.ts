import { useCallback } from 'react'
import { useReservationStore, useDecisionLogStore } from '@/stores'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { suggestSeating } from '@/services/seating'
import { isActiveStatus } from '@/utils'
import type { Reservation } from '@/types'

/** A reservation still needs a table if it's active and unassigned. */
function needsAssignment(r: Reservation): boolean {
  return isActiveStatus(r.status) && !(r.assignedTableIds && r.assignedTableIds.length > 0)
}

/**
 * One-click bulk seating: assign every unassigned reservation its best table.
 *
 * Reservations are processed in time order and each assignment is fed forward, so
 * a later booking sees earlier ones holding their tables — but only during their
 * own [start, end] window. That lets one table serve several reservations across
 * the service (a 17:00–19:00 booking and a 19:30–21:30 booking share a table),
 * with `canSeat`'s turnover buffer keeping them apart. Every decision is logged.
 */
export function useAssignAll() {
  const reservations = useReservationStore((s) => s.reservations)
  const assignTable = useReservationStore((s) => s.assignTable)
  const clearAssignment = useReservationStore((s) => s.clearAssignment)
  const logSuggestion = useDecisionLogStore((s) => s.logSuggestion)
  const recordAccept = useDecisionLogStore((s) => s.recordAccept)
  const floor = useSeatingFloor()

  const assignableCount = reservations.filter(needsAssignment).length
  const assignedCount = reservations.filter(
    (r) => r.assignedTableIds && r.assignedTableIds.length > 0,
  ).length

  const assignAll = useCallback(() => {
    // Local working copy so each assignment is visible to later iterations
    // (the store updates too, but its snapshot in this closure would be stale).
    let working = [...reservations]
    const queue = working
      .filter(needsAssignment)
      .sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime))

    for (const res of queue) {
      const others = working.filter((r) => r.id !== res.id)
      const suggestions = suggestSeating(res, floor, others)
      if (suggestions.length === 0) continue

      const best = suggestions[0]
      const decisionId = logSuggestion(res.id, res.partySize, suggestions)
      recordAccept(decisionId, best.candidate.tableIds)
      assignTable(res.id, best.candidate.tableIds)
      working = working.map((r) =>
        r.id === res.id ? { ...r, assignedTableIds: best.candidate.tableIds } : r,
      )
    }
  }, [reservations, floor, assignTable, logSuggestion, recordAccept])

  const clearAll = useCallback(() => {
    for (const r of reservations) {
      if (r.assignedTableIds && r.assignedTableIds.length > 0) clearAssignment(r.id)
    }
  }, [reservations, clearAssignment])

  return { assignAll, assignableCount, clearAll, assignedCount }
}
