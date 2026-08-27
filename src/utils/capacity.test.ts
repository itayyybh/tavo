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

  it('anchors on the largest table (solo) + connected for the rest, for a 2-table merge', () => {
    // Anchor keeps its solo 4, the other adds connected 3 → 7. No join penalty
    // for a 2-table merge.
    expect(hypotheticalMergeCapacity([table('a'), table('b')], types)).toBe(7)
  })

  it('a row of 3 seats 9: anchor solo 4 + 3 + 3, minus one interior join', () => {
    // 4 (anchor solo) + 3 + 3 = 10, minus (N-2)=1 interior join → 9.
    expect(hypotheticalMergeCapacity([table('a'), table('b'), table('c')], types)).toBe(9)
  })

  it('scales the N-2 penalty for larger rows', () => {
    const row = (n: number) => Array.from({ length: n }, (_, i) => table(`t${i}`))
    expect(hypotheticalMergeCapacity(row(4), types)).toBe(11) // 4 + 3+3+3 - 2
    expect(hypotheticalMergeCapacity(row(5), types)).toBe(13) // 4 + 3*4 - 3
  })

  it('a big table anchors even when smaller tables are pushed onto it', () => {
    // The 41+141 case: a big round (solo 8, connected 4) keeps its solo when a
    // 2-top attaches → 8 + 2 = 10, not 4 + 2 = 6.
    const ROUND: TableType = {
      ...SQUARE,
      id: 'round',
      soloCapacity: 8,
      connectedCapacity: 4,
    }
    const DEUCE: TableType = {
      ...SQUARE,
      id: 'deuce',
      soloCapacity: 2,
      connectedCapacity: 2,
    }
    const round = table('41', { typeId: 'round' })
    const deuce = table('141', { typeId: 'deuce' })
    expect(hypotheticalMergeCapacity([deuce, round], [ROUND, DEUCE])).toBe(10)
  })

  it('never returns negative seats', () => {
    const tiny: TableType = { ...SQUARE, id: 'tiny', soloCapacity: 0, connectedCapacity: 0 }
    const t = (id: string): Table => table(id, { typeId: 'tiny' })
    expect(hypotheticalMergeCapacity([t('a'), t('b'), t('c')], [tiny])).toBe(0)
  })
})

describe('groupCapacity', () => {
  const merged = (id: string): Table => table(id, { mergedGroupId: 'g1' })

  it('uses the shared merge model for actual merged members', () => {
    // Anchor solo 4 + 3 + 3 = 10, minus one interior join → 9.
    expect(groupCapacity([merged('a'), merged('b'), merged('c')], types)).toBe(9)
  })

  it('anchors on the largest table for a 2-member group', () => {
    // Anchor solo 4 + connected 3 = 7.
    expect(groupCapacity([merged('a'), merged('b')], types)).toBe(7)
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
