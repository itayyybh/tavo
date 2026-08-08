import { describe, it, expect } from 'vitest'
import { optimizeAssignments } from './optimizeAssignments'
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
 * Reservation Assignment Optimizer tests (Phase 12, Step 1). Exercises the pure
 * planner: displacing tentative bookings so an otherwise-unseatable reservation
 * fits, and the guards that keep every produced plan valid (committed parties
 * frozen, MANUAL pins frozen, non-overlapping bookings untouched, external time
 * conflicts honoured).
 *
 * Only ENGINE-assigned holds (`assignmentSource: 'auto'`) are reshuffleable, so
 * the movable bookings below carry that flag; a manual pin is never moved.
 *
 * Tables are placed far apart so no merge candidates form — the scenarios are
 * pure single-table reshuffles, which isolates the search from geometry.
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

/** A table of `type`, at a far-flung position so nothing merges by adjacency. */
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
  weights: {
    capacityFit: 10,
    zoneMatch: 6,
    preferredTable: 8,
    singleTable: 3,
    preferredCombo: 12,
  },
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

const res = (
  id: ID,
  partySize: number,
  over: Partial<Reservation> = {},
): Reservation => ({
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

/** Look up a reservation's move in a plan. */
const moveFor = (plan: NonNullable<ReturnType<typeof optimizeAssignments>>, id: ID) =>
  plan.moves.find((m) => m.reservationId === id)

describe('optimizeAssignments', () => {
  it('displaces an oversized-parked booking to seat a large party', () => {
    // T8 (the only 8-seat) is held by a party of 2; two free deuces exist.
    const tables = [table('8', BIG), table('1', SMALL), table('2', SMALL)]
    const floor = floorOf(tables)
    const parked = res('parked', 2, { assignedTableIds: ['T8'], assignmentSource: 'auto' })
    const target = res('target', 8)

    const plan = optimizeAssignments(target, floor, [parked, target])

    expect(plan).not.toBeNull()
    // Target seated on the only fitting table.
    expect(moveFor(plan!, 'target')).toEqual({
      reservationId: 'target',
      fromTableIds: [],
      toTableIds: ['T8'],
    })
    // The deuce moved off T8 onto a free small table.
    const moved = moveFor(plan!, 'parked')!
    expect(moved.fromTableIds).toEqual(['T8'])
    expect(['T1', 'T2']).toContain(moved.toTableIds[0])
    // Target's placement leads the plan.
    expect(plan!.moves[0].reservationId).toBe('target')
  })

  it('chains displacements when the freed table is itself held', () => {
    // Only T2 is free. T8 held by A(2), T1 held by B(2). Seating an 8-top forces
    // A off T8; the only home for A is T1, which forces B onto T2.
    const tables = [table('8', BIG), table('1', SMALL), table('2', SMALL)]
    const floor = floorOf(tables)
    const a = res('A', 2, { assignedTableIds: ['T8'], assignmentSource: 'auto' })
    const b = res('B', 2, { assignedTableIds: ['T1'], assignmentSource: 'auto' })
    const target = res('target', 8)

    const plan = optimizeAssignments(target, floor, [a, b, target])

    expect(plan).not.toBeNull()
    expect(moveFor(plan!, 'target')!.toTableIds).toEqual(['T8'])
    // Every reservation ends on a distinct table and all are seated.
    const finals = new Map<ID, string[]>([
      ['A', ['T8']],
      ['B', ['T1']],
    ])
    for (const m of plan!.moves) finals.set(m.reservationId, m.toTableIds)
    const allTables = [...finals.values()].flat()
    expect(new Set(allTables).size).toBe(allTables.length) // no table shared
    expect(finals.get('target')).toEqual(['T8'])
  })

  it('returns a single-move plan when the target already fits a free table', () => {
    const tables = [table('8', BIG), table('1', SMALL)]
    const floor = floorOf(tables)
    const other = res('other', 2, { assignedTableIds: ['T1'], assignmentSource: 'auto' })
    const target = res('target', 8)

    const plan = optimizeAssignments(target, floor, [other, target])

    expect(plan).not.toBeNull()
    expect(plan!.moves).toHaveLength(1)
    expect(plan!.moves[0]).toEqual({
      reservationId: 'target',
      fromTableIds: [],
      toTableIds: ['T8'],
    })
  })

  it('returns null when no reshuffle can free a fitting table', () => {
    // T8 held by a deuce, but there is nowhere for that deuce to go.
    const tables = [table('8', BIG)]
    const floor = floorOf(tables)
    const parked = res('parked', 2, { assignedTableIds: ['T8'], assignmentSource: 'auto' })
    const target = res('target', 8)

    expect(optimizeAssignments(target, floor, [parked, target])).toBeNull()
  })

  it('never moves a committed (arrived/seated) party', () => {
    // Same shape as the displace test, but the party on T8 has arrived — frozen.
    const tables = [table('8', BIG), table('1', SMALL), table('2', SMALL)]
    const floor = floorOf(tables)
    const arrived = res('arrived', 2, {
      assignedTableIds: ['T8'],
      status: 'arrived',
    })
    const target = res('target', 8)

    expect(optimizeAssignments(target, floor, [arrived, target])).toBeNull()
  })

  it('never relocates a manually pinned booking', () => {
    // Same shape as the displace test, but the party on T8 was MANUALLY assigned.
    // A manual pin is off-limits to the optimizer even though it is tentative, so
    // no reshuffle frees T8 and there is no plan.
    const tables = [table('8', BIG), table('1', SMALL), table('2', SMALL)]
    const floor = floorOf(tables)
    const pinned = res('pinned', 2, {
      assignedTableIds: ['T8'],
      assignmentSource: 'manual',
    })
    const target = res('target', 8)

    expect(optimizeAssignments(target, floor, [pinned, target])).toBeNull()
  })

  it('treats an assignment with no recorded source as a manual pin', () => {
    // Legacy / pre-migration hold (undefined source) must also be frozen.
    const tables = [table('8', BIG), table('1', SMALL), table('2', SMALL)]
    const floor = floorOf(tables)
    const legacy = res('legacy', 2, { assignedTableIds: ['T8'] }) // no assignmentSource
    const target = res('target', 8)

    expect(optimizeAssignments(target, floor, [legacy, target])).toBeNull()
  })

  it('ignores bookings whose time window does not overlap the target', () => {
    // A holds T8 at lunch; the target is at dinner — no conflict, no reshuffle.
    const tables = [table('8', BIG)]
    const floor = floorOf(tables)
    const lunch = res('lunch', 8, {
      assignedTableIds: ['T8'],
      dateTime: '2026-08-12T13:00:00',
    })
    const target = res('target', 8)

    const plan = optimizeAssignments(target, floor, [lunch, target])

    expect(plan).not.toBeNull()
    expect(plan!.moves).toHaveLength(1)
    expect(plan!.moves[0].reservationId).toBe('target')
    expect(moveFor(plan!, 'lunch')).toBeUndefined()
  })

  it('will not relocate a booking onto a table an external booking holds', () => {
    // T8 held by the movable A(2). The only small tables are T1 (free) and T2,
    // but T2 is held by an EXTERNAL booking C that overlaps A — so A must take
    // T1. If T1 were also blocked, there would be no plan.
    const tables = [table('8', BIG), table('1', SMALL), table('2', SMALL)]
    const floor = floorOf(tables)
    const a = res('A', 2, { assignedTableIds: ['T8'], assignmentSource: 'auto' })
    // C overlaps A's window but its own window does not overlap the 8-top target
    // enough to matter for T8 — it only blocks T2.
    const c = res('C', 2, {
      assignedTableIds: ['T2'],
      dateTime: AT_8PM,
      status: 'arrived', // committed → external, its table is off-limits
    })
    const target = res('target', 8)

    const plan = optimizeAssignments(target, floor, [a, c, target])

    expect(plan).not.toBeNull()
    // A had to take the only free deuce, T1 — never C's T2.
    expect(moveFor(plan!, 'A')!.toTableIds).toEqual(['T1'])
    expect(moveFor(plan!, 'C')).toBeUndefined()
  })
})
