import { describe, it, expect, beforeEach } from 'vitest'
import { useFloorStore } from './floorStore'
import type { FloorSnapshot } from '@/types'

const get = () => useFloorStore.getState()

const SNAPSHOT: FloorSnapshot = {
  seatings: [],
  runtimeMerges: [],
  statusOverrides: { t9: 'blocked' },
  cleaningSince: {},
  positionOverrides: { t9: { x: 1, y: 2 } },
  rotationOverrides: {},
}

/**
 * Undo/redo of manual floor edits. The manual actions exercised here
 * (moveTable, setTableStatus) write the override maps directly and don't read
 * the layout store, so they can be driven in isolation.
 */
describe('floorStore history', () => {
  beforeEach(() => {
    get().resetService() // clean content + wiped stacks
  })

  it('records a move and undoes/redoes it', () => {
    expect(get().past).toHaveLength(0)

    get().moveTable('t1', { x: 5, y: 5 })
    expect(get().positionOverrides.t1).toEqual({ x: 5, y: 5 })
    expect(get().past).toHaveLength(1)
    expect(get().future).toHaveLength(0)

    get().undo()
    expect(get().positionOverrides.t1).toBeUndefined()
    expect(get().past).toHaveLength(0)
    expect(get().future).toHaveLength(1)

    get().redo()
    expect(get().positionOverrides.t1).toEqual({ x: 5, y: 5 })
    expect(get().past).toHaveLength(1)
    expect(get().future).toHaveLength(0)
  })

  it('a new edit clears the redo stack', () => {
    get().moveTable('t1', { x: 1, y: 1 })
    get().undo()
    expect(get().future).toHaveLength(1)

    get().setTableStatus('t2', 'blocked')
    expect(get().future).toHaveLength(0)
    expect(get().past).toHaveLength(1)
  })

  it('undo/redo are no-ops on empty stacks', () => {
    expect(() => get().undo()).not.toThrow()
    expect(() => get().redo()).not.toThrow()
    expect(get().past).toHaveLength(0)
    expect(get().future).toHaveLength(0)
  })

  it('replaceAll swaps content WITHOUT wiping history (sync echo safe)', () => {
    get().moveTable('t1', { x: 3, y: 3 })
    expect(get().past).toHaveLength(1)

    // The sync layer re-applies snapshots often; that must not destroy the undo
    // stack a host built up locally.
    get().replaceAll(SNAPSHOT)
    expect(get().statusOverrides.t9).toBe('blocked')
    expect(get().past).toHaveLength(1)

    // The recorded snapshot is still restorable after the content swap.
    get().undo()
    expect(get().positionOverrides.t1).toBeUndefined()
  })

  it('resetService clears both content and history', () => {
    get().moveTable('t1', { x: 9, y: 9 })
    expect(get().past).toHaveLength(1)

    get().resetService()
    expect(get().positionOverrides).toEqual({})
    expect(get().past).toHaveLength(0)
    expect(get().future).toHaveLength(0)
  })
})

/**
 * Plan → live handoff (`adoptPlan`): a planned day's arrangement is layered onto
 * the live shift, additively and without disturbing tables already in play.
 */
describe('floorStore adoptPlan', () => {
  beforeEach(() => get().resetService())

  it('adds plan merges + positions onto a clean shift', () => {
    get().adoptPlan({
      positionOverrides: { t1: { x: 4, y: 5 } },
      rotationOverrides: { t1: 90 },
      merges: [{ tableIds: ['t2', 't3'], needsArrange: false }],
    })
    expect(get().positionOverrides.t1).toEqual({ x: 4, y: 5 })
    expect(get().rotationOverrides.t1).toBe(90)
    expect(get().runtimeMerges).toHaveLength(1)
    expect(get().runtimeMerges[0].tableIds).toEqual(['t2', 't3'])
    expect(get().runtimeMerges[0].seatingId).toBeUndefined()
  })

  it('never disturbs a table already seated or merged live', () => {
    get().replaceAll({
      seatings: [{ id: 's1', reservationId: 'r1', tableIds: ['t1'], seatedAt: '' }],
      runtimeMerges: [{ id: 'm1', tableIds: ['t2', 't3'], seatingId: 's1' }],
      statusOverrides: {},
      cleaningSince: {},
      positionOverrides: {},
      rotationOverrides: {},
    })
    get().adoptPlan({
      positionOverrides: { t1: { x: 9, y: 9 } }, // t1 is seated — must be ignored
      rotationOverrides: {},
      merges: [{ tableIds: ['t2', 't3'] }], // already a live merge — no duplicate
    })
    expect(get().positionOverrides.t1).toBeUndefined()
    expect(get().runtimeMerges).toHaveLength(1)
  })
})
