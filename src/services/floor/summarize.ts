/**
 * At-a-glance occupancy metrics for the Live Floor (Phase 8). Pure + cheap — the
 * summary header reads this so capacity pressure is visible without scanning the
 * canvas. Seats are counted per table (solo capacity); merged-group connected
 * capacity is a later refinement.
 */
import type { FloorTableStatus, TableType } from '@/types'
import { seatsForTable } from '@/utils'
import type { EffectiveFloor } from './types'

export interface FloorSummary {
  /** Table counts per effective status. */
  counts: Record<FloorTableStatus, number>
  totalTables: number
  totalSeats: number
  /** Seats on occupied tables. */
  occupiedSeats: number
  /** Seats on available tables. */
  freeSeats: number
}

export function summarizeFloor(
  floor: EffectiveFloor,
  tableTypes: TableType[],
): FloorSummary {
  const counts: Record<FloorTableStatus, number> = {
    available: 0,
    reserved: 0,
    occupied: 0,
    cleaning: 0,
    blocked: 0,
  }
  const typeById = new Map(tableTypes.map((t) => [t.id, t]))
  let totalSeats = 0
  let occupiedSeats = 0
  let freeSeats = 0

  for (const et of floor.tables) {
    counts[et.status] += 1
    const seats = seatsForTable(et.base, typeById.get(et.base.typeId))
    totalSeats += seats
    if (et.status === 'occupied') occupiedSeats += seats
    if (et.status === 'available') freeSeats += seats
  }

  return {
    counts,
    totalTables: floor.tables.length,
    totalSeats,
    occupiedSeats,
    freeSeats,
  }
}
