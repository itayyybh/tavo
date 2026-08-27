import { describe, it, expect } from 'vitest'
import { deriveFloorState } from './deriveFloorState'
import type { FloorSnapshot, Reservation, Table } from '@/types'

/**
 * Plan-mode derivation (`planDate`): the floor becomes a planning canvas for a
 * chosen day. Every still-active booking ON that day with assigned tables reads
 * `reserved` — ungated by the lookahead window (the whole day is "the plan"). The
 * caller (the plan hook) supplies a plan-scoped snapshot (that day's own
 * arrangement, never the live shift), which flows through unchanged.
 */

const NOW = Date.parse('2026-08-27T19:00:00')

const table = (id: string): Table => ({
  id,
  zoneId: 'z1',
  typeId: 'tt',
  label: id,
  position: { x: 0, y: 0 },
  size: { x: 1, y: 1 },
  rotation: 0,
  status: 'available',
})

const res = (id: string, over: Partial<Reservation> = {}): Reservation => ({
  id,
  guestName: id,
  partySize: 2,
  dateTime: '2026-08-28T20:00:00', // tomorrow, well beyond a 30m lookahead
  estimatedDuration: 90,
  status: 'confirmed',
  source: 'manual',
  createdAt: '',
  updatedAt: '',
  ...over,
})

const EMPTY_PLAN: FloorSnapshot = {
  seatings: [],
  runtimeMerges: [],
  statusOverrides: {},
  cleaningSince: {},
  positionOverrides: {},
  rotationOverrides: {},
}

const plan = (
  tables: Table[],
  reservations: Reservation[],
  planDate: string,
  snapshot: FloorSnapshot = EMPTY_PLAN,
) =>
  deriveFloorState({
    tables,
    reservations,
    snapshot,
    reservedLookaheadMin: 30,
    turnoverBufferMin: 15,
    now: NOW,
    planDate,
  })

describe('deriveFloorState — plan mode', () => {
  it('marks a far-off booking assigned that day as reserved (ignores lookahead)', () => {
    const tables = [table('t1'), table('t2')]
    const reservations = [res('r1', { assignedTableIds: ['t1'] })]
    const floor = plan(tables, reservations, '2026-08-28')
    expect(floor.byId['t1'].status).toBe('reserved')
    expect(floor.byId['t1'].reservationId).toBe('r1')
    expect(floor.byId['t2'].status).toBe('available')
  })

  it('excludes bookings on other days and terminal statuses', () => {
    const tables = [table('t1'), table('t2')]
    const reservations = [
      res('other-day', { assignedTableIds: ['t1'], dateTime: '2026-08-29T20:00:00' }),
      res('cancelled', { assignedTableIds: ['t2'], status: 'cancelled' }),
    ]
    const floor = plan(tables, reservations, '2026-08-28')
    expect(floor.byId['t1'].status).toBe('available')
    expect(floor.byId['t2'].status).toBe('available')
  })

  it('applies the plan snapshot arrangement (merges + positions)', () => {
    const tables = [table('t1'), table('t2')]
    const snapshot: FloorSnapshot = {
      ...EMPTY_PLAN,
      runtimeMerges: [{ id: 'm1', tableIds: ['t1', 't2'], seatingId: undefined }],
      positionOverrides: { t1: { x: 5, y: 6 } },
    }
    const floor = plan(tables, [], '2026-08-28', snapshot)
    expect(floor.byId['t1'].mergedGroupId).toBe('m1')
    expect(floor.byId['t1'].isRuntimeMerge).toBe(true)
    expect(floor.byId['t1'].position).toEqual({ x: 5, y: 6 })
  })
})
