import { describe, it, expect } from 'vitest'
import { suggestSeating } from './suggest'
import type { SeatingFloor } from './types'
import type { Reservation, SeatingConfig, Table, TableType, Zone } from '@/types'

/**
 * Declared merged groups as first-class candidates: the engine must offer a
 * base-layout group whole, at its real (override-honouring) capacity — not
 * re-derive a hypothetical merge from raw connected capacities. Regression for a
 * big round + small table pushed together and labelled 8 seats being wrongly
 * refused a party of 7 (connected sum was only 6).
 */

const ROUND: TableType = {
  id: 'tt-round',
  name: 'Big round',
  shape: 'round',
  defaultSize: { x: 2, y: 2 },
  clearance: 0.1,
  soloCapacity: 8,
  connectedCapacity: 4, // a round loses seats once a table is pushed onto it
}
const SMALL: TableType = {
  id: 'tt-small',
  name: 'Deuce',
  shape: 'square',
  defaultSize: { x: 1, y: 1 },
  clearance: 0.1,
  soloCapacity: 2,
  connectedCapacity: 2,
}

const ZONE: Zone = {
  id: 'z1',
  name: 'no smoking',
  color: '#fff',
  position: { x: 0, y: 0 },
  size: { x: 1000, y: 1000 },
  allowTableRelocation: false,
}

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

const t41: Table = {
  id: 'T41',
  zoneId: ZONE.id,
  typeId: ROUND.id,
  label: '41',
  position: { x: 0, y: 0 },
  size: ROUND.defaultSize,
  rotation: 0,
  status: 'available',
  mergedGroupId: 'g1',
}
const t141: Table = {
  id: 'T141',
  zoneId: ZONE.id,
  typeId: SMALL.id,
  label: '141',
  position: { x: 2, y: 0 },
  size: SMALL.defaultSize,
  rotation: 0,
  status: 'available',
  mergedGroupId: 'g1',
}

const floor: SeatingFloor = {
  tables: [t41, t141],
  tableTypes: [ROUND, SMALL],
  zones: [ZONE],
  obstacles: [],
  // Host pushed the small table onto the big round and set the group to 8 seats.
  mergedGroups: [{ id: 'g1', tableIds: ['T41', 'T141'], seats: 8 }],
  config: CONFIG,
}

const res = (partySize: number): Reservation => ({
  id: 'r-liran',
  guestName: 'לירן',
  partySize,
  dateTime: '2026-08-28T19:00:00',
  estimatedDuration: 120,
  status: 'confirmed',
  source: 'manual',
  preferredZoneId: ZONE.id,
  createdAt: '',
  updatedAt: '',
})

describe('seating — declared merged group as a candidate', () => {
  it('offers the whole group at its override capacity for a party of 7', () => {
    const suggestions = suggestSeating(res(7), floor, [])
    const group = suggestions.find(
      (s) => s.candidate.tableIds.join('+') === 'T141+T41',
    )
    expect(group).toBeDefined()
    expect(group?.candidate.seats).toBe(8)
  })

  it('does not offer a group member as a fragmentary single', () => {
    const suggestions = suggestSeating(res(2), floor, [])
    const loneRound = suggestions.find(
      (s) => s.candidate.tableIds.length === 1 && s.candidate.tableIds[0] === 'T41',
    )
    expect(loneRound).toBeUndefined()
  })
})
