import { describe, it, expect } from 'vitest'
import type { MergedGroup, Table, TableType } from '@/types'
import { groupCapacity, hypotheticalMergeCapacity, seatsForTable } from './capacity'

/** A square table type: 4 seats solo, 3 when connected in a row. */
const SQUARE: TableType = {
  id: 'sq',
  name: 'Square',
  shape: 'square',
  defaultSize: { x: 60, y: 60 },
  clearance: 20,
  soloCapacity: 4,
  connectedCapacity: 3,
}

const types = [SQUARE]

const table = (id: string, over: Partial<Table> = {}): Table => ({
  id,
  zoneId: 'z1',
  typeId: 'sq',
  label: id,
  position: { x: 0, y: 0 },
  size: { x: 60, y: 60 },
  rotation: 0,
  status: 'available',
  ...over,
})

describe('hypotheticalMergeCapacity', () => {
  it('returns 0 for fewer than 2 tables', () => {
    expect(hypotheticalMergeCapacity([], types)).toBe(0)
    expect(hypotheticalMergeCapacity([table('a')], types)).toBe(0)
  })

  it('keeps the plain sum for a 2-table merge (single join)', () => {
    // 3 + 3, no seat displaced.
    expect(hypotheticalMergeCapacity([table('a'), table('b')], types)).toBe(6)
  })

  it('a row of 3 connected 3-seaters seats 8, not 7 (both ends keep a seat)', () => {
    // Regression: only joins PAST the first displace a chair, so a straight
    // row of N tables loses N-2 seats — here 9 - 1 = 8. The prior off-by-one
    // subtracted N-1 and wrongly returned 7.
    expect(hypotheticalMergeCapacity([table('a'), table('b'), table('c')], types)).toBe(8)
  })

  it('scales the N-2 penalty for larger rows', () => {
    const row = (n: number) => Array.from({ length: n }, (_, i) => table(`t${i}`))
    expect(hypotheticalMergeCapacity(row(4), types)).toBe(10) // 12 - 2
    expect(hypotheticalMergeCapacity(row(5), types)).toBe(12) // 15 - 3
  })

  it('never returns negative seats', () => {
    const tiny: TableType = { ...SQUARE, id: 'tiny', connectedCapacity: 0 }
    const t = (id: string): Table => table(id, { typeId: 'tiny' })
    expect(hypotheticalMergeCapacity([t('a'), t('b'), t('c')], [tiny])).toBe(0)
  })
})

describe('groupCapacity', () => {
  const merged = (id: string): Table => table(id, { mergedGroupId: 'g1' })

  it('applies the same N-2 penalty to actual merged members', () => {
    // Three merged members contribute connectedCapacity (3 each): 9 - 1 = 8.
    expect(groupCapacity([merged('a'), merged('b'), merged('c')], types)).toBe(8)
  })

  it('keeps the plain sum for a 2-member group', () => {
    expect(groupCapacity([merged('a'), merged('b')], types)).toBe(6)
  })

  it("honours a group's manual seat override", () => {
    const group: MergedGroup = { id: 'g1', tableIds: ['a', 'b', 'c'], seats: 11 }
    expect(groupCapacity([merged('a'), merged('b'), merged('c')], types, group)).toBe(11)
  })
})

describe('seatsForTable', () => {
  it('uses solo capacity when unmerged, connected when merged', () => {
    expect(seatsForTable(table('a'), SQUARE)).toBe(4)
    expect(seatsForTable(table('a', { mergedGroupId: 'g1' }), SQUARE)).toBe(3)
  })

  it('returns 0 for an unknown type', () => {
    expect(seatsForTable(table('a'), undefined)).toBe(0)
  })
})
