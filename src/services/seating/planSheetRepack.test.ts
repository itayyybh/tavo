import { describe, it, expect } from 'vitest'
import { planSheetRepack } from './planSheetRepack'
import type { SeatingFloor } from './types'
import type {
  ID,
  Reservation,
  ReservationStatus,
  SeatingConfig,
  Table,
  TableType,
  Zone,
} from '@/types'

/**
 * Whole-sheet repack planner tests (Phase 12, A1). Verifies the batch planner
 * seats bookings that only fit after a reshuffle, leaves direct-fit bookings for
 * Assign-all, and returns net moves. Tables far apart so nothing merges.
 */

const SMALL: TableType = {
  id: 'tt-small',
  name: 'Deuce',
  shape: 'square',
  defaultSize: { x: 1, y: 1 },
  clearance: 0.1,
  soloCapacity: 2,
  connectedCapacity: 2,
}
const BIG: TableType = {
  id: 'tt-big',
  name: 'Eight-top',
  shape: 'rectangle',
  defaultSize: { x: 2, y: 1 },
  clearance: 0.1,
  soloCapacity: 8,
  connectedCapacity: 8,
}

const ZONE: Zone = {
  id: 'z1',
  name: 'Main',
  color: '#fff',
  position: { x: 0, y: 0 },
  size: { x: 1000, y: 1000 },
  allowTableRelocation: false,
}

let seq = 0
const table = (label: string, type: TableType): Table => ({
  id: `T${label}`,
  zoneId: ZONE.id,
  typeId: type.id,
  label,
  position: { x: seq++ * 100, y: 0 },
  size: type.defaultSize,
  rotation: 0,
  status: 'available',
})

const CONFIG: SeatingConfig = {
  merge: {
    forbiddenCombos: [],
    forbiddenLabelCombos: [],
    maxMergeSize: 5,
    allowCrossZoneMerge: false,
    proximityWeight: 1,
    largePartyRules: [],
    lastResortGatherZone: false,
  },
  turnoverBufferMin: 15,
  maxUnderfill: 2,
  weights: { capacityFit: 10, zoneMatch: 6, preferredTable: 8, singleTable: 3, preferredCombo: 12 },
}

const floorOf = (tables: Table[]): SeatingFloor => ({
  tables,
  tableTypes: [SMALL, BIG],
  zones: [ZONE],
  obstacles: [],
  mergedGroups: [],
  config: CONFIG,
})

const AT_8PM = '2026-08-12T20:00:00'

const res = (id: ID, partySize: number, over: Partial<Reservation> = {}): Reservation => ({
  id,
  guestName: id,
  partySize,
  dateTime: AT_8PM,
  estimatedDuration: 120,
  preferredZoneId: ZONE.id,
  status: 'confirmed' as ReservationStatus,
  source: 'manual',
  createdAt: AT_8PM,
  updatedAt: AT_8PM,
  ...over,
})

describe('planSheetRepack', () => {
  it('seats an unfittable booking by reshuffling a parked auto hold', () => {
    const tables = [table('8', BIG), table('1', SMALL), table('2', SMALL)]
    const floor = floorOf(tables)
    const parked = res('parked', 2, { assignedTableIds: ['T8'], assignmentSource: 'auto' })
    const big = res('big', 8) // unseated, only fits T8

    const plan = planSheetRepack([parked, big], floor)

    expect(plan.seated).toEqual(['big'])
    const bigMove = plan.moves.find((m) => m.reservationId === 'big')!
    expect(bigMove.toTableIds).toEqual(['T8'])
    const parkedMove = plan.moves.find((m) => m.reservationId === 'parked')!
    expect(parkedMove.fromTableIds).toEqual(['T8'])
    expect(['T1', 'T2']).toContain(parkedMove.toTableIds[0])
  })

  it('leaves a direct-fit unseated booking for Assign-all (no repack)', () => {
    const tables = [table('8', BIG), table('1', SMALL)]
    const floor = floorOf(tables)
    const big = res('big', 8) // T8 is free — greedy fits it, no reshuffle needed

    const plan = planSheetRepack([big], floor)

    expect(plan.seated).toEqual([])
    expect(plan.moves).toEqual([])
  })

  it('returns an empty plan when no reshuffle can seat the unfittable booking', () => {
    const tables = [table('8', BIG)]
    const floor = floorOf(tables)
    const parked = res('parked', 2, { assignedTableIds: ['T8'], assignmentSource: 'auto' })
    const big = res('big', 8)

    const plan = planSheetRepack([parked, big], floor)

    expect(plan.seated).toEqual([])
    expect(plan.moves).toEqual([])
  })

  it('does not disturb a manual pin', () => {
    const tables = [table('8', BIG), table('1', SMALL), table('2', SMALL)]
    const floor = floorOf(tables)
    const pinned = res('pinned', 2, { assignedTableIds: ['T8'], assignmentSource: 'manual' })
    const big = res('big', 8)

    const plan = planSheetRepack([pinned, big], floor)

    expect(plan.seated).toEqual([])
    expect(plan.moves).toEqual([])
  })
})
