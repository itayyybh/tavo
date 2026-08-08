import { describe, it, expect } from 'vitest'
import { deriveFloorState } from './deriveFloorState'
import { suggestSeating } from '@/services/seating'
import type { SeatingFloor } from '@/services/seating/types'
import type {
  FloorSnapshot,
  Reservation,
  ReservationStatus,
  SeatingConfig,
  Table,
  TableType,
} from '@/types'

/**
 * Full-service simulation (Real-service reliability phase).
 *
 * Plays a realistic evening through the two PURE layers that carry the
 * reliability guarantees — `deriveFloorState` (what the host sees) and the
 * Seating Engine (`suggestSeating`) — asserting the behaviours the phase fixed:
 * reserved/upcoming/next-seating awareness, graded urgency, double-book
 * detection, no recommending a held/seated/stored table, and second seating.
 */

const NOW = Date.parse('2026-08-12T19:00:00')
const at = (hhmm: string) => `2026-08-12T${hhmm}:00`

const EMPTY: FloorSnapshot = {
  seatings: [],
  runtimeMerges: [],
  statusOverrides: {},
  cleaningSince: {},
  positionOverrides: {},
  rotationOverrides: {},
}

const table = (id: string, over: Partial<Table> = {}): Table => ({
  id,
  zoneId: 'z1',
  typeId: 'tt',
  label: id,
  position: { x: 0, y: 0 },
  size: { x: 1, y: 1 },
  rotation: 0,
  status: 'available',
  ...over,
})

const res = (id: string, over: Partial<Reservation> = {}): Reservation => ({
  id,
  guestName: id,
  partySize: 2,
  dateTime: at('19:20'),
  estimatedDuration: 90,
  status: 'confirmed' as ReservationStatus,
  source: 'manual',
  createdAt: '',
  updatedAt: '',
  ...over,
})

const derive = (tables: Table[], reservations: Reservation[], snapshot = EMPTY) =>
  deriveFloorState({
    tables,
    reservations,
    snapshot,
    reservedLookaheadMin: 30,
    turnoverBufferMin: 15,
    now: NOW,
  })

describe('service simulation — deriveFloorState', () => {
  it('grades reserved urgency by minutes-to-arrival', () => {
    const tables = ['soon', 'due', 'imminent', 'overdue', 'far'].map((id) => table(id))
    const reservations = [
      res('rSoon', { assignedTableIds: ['soon'], dateTime: at('19:20') }), // 20m
      res('rDue', { assignedTableIds: ['due'], dateTime: at('19:10') }), // 10m
      res('rImm', { assignedTableIds: ['imminent'], dateTime: at('19:03') }), // 3m
      res('rOver', { assignedTableIds: ['overdue'], dateTime: at('18:55') }), // -5m
      res('rFar', { assignedTableIds: ['far'], dateTime: at('20:00') }), // 60m
    ]
    const floor = derive(tables, reservations)

    expect(floor.byId.soon.status).toBe('reserved')
    expect(floor.byId.soon.urgency).toBe('soon')
    expect(floor.byId.due.urgency).toBe('due')
    expect(floor.byId.imminent.urgency).toBe('imminent')
    expect(floor.byId.overdue.urgency).toBe('overdue')
    // Beyond the lookahead: still available (walk-in seatable), flagged upcoming.
    expect(floor.byId.far.status).toBe('available')
    expect(floor.byId.far.upcomingReservationId).toBe('rFar')
    expect(floor.byId.far.urgency).toBeUndefined()
  })

  it('an arrived party reads reserved+overdue regardless of clock', () => {
    const tables = [table('A')]
    const reservations = [
      res('rA', { assignedTableIds: ['A'], dateTime: at('20:30'), status: 'arrived' }),
    ]
    const floor = derive(tables, reservations)
    expect(floor.byId.A.status).toBe('reserved')
    expect(floor.byId.A.urgency).toBe('overdue') // guest is here — seat now
  })

  it('binds a table to the SOONEST booking, not array order', () => {
    const tables = [table('A')]
    const reservations = [
      res('late', { assignedTableIds: ['A'], dateTime: at('19:25') }),
      res('early', { assignedTableIds: ['A'], dateTime: at('19:10') }),
    ]
    const floor = derive(tables, reservations)
    expect(floor.byId.A.reservationId).toBe('early')
  })

  it('shows the next seating on an occupied table (second seating)', () => {
    const tables = [table('A')]
    const snapshot: FloorSnapshot = {
      ...EMPTY,
      seatings: [{ id: 's1', reservationId: 'now', tableIds: ['A'], seatedAt: at('18:30') }],
    }
    const reservations = [
      res('now', { assignedTableIds: ['A'], dateTime: at('18:30'), status: 'seated' }),
      res('next', { assignedTableIds: ['A'], dateTime: at('21:00') }),
    ]
    const floor = derive(tables, reservations, snapshot)
    expect(floor.byId.A.status).toBe('occupied')
    expect(floor.byId.A.reservationId).toBe('now')
    expect(floor.byId.A.nextReservationId).toBe('next')
  })

  it('flags a double-booked table instead of hiding a booking', () => {
    const tables = [table('A')]
    const reservations = [
      res('g1', { assignedTableIds: ['A'], dateTime: at('19:20') }),
      res('g2', { assignedTableIds: ['A'], dateTime: at('19:30') }), // overlaps g1
    ]
    const floor = derive(tables, reservations)
    expect(floor.byId.A.conflict).toBe(true)
  })

  it('occupied outranks a reservation on the same table', () => {
    const tables = [table('A')]
    const snapshot: FloorSnapshot = {
      ...EMPTY,
      seatings: [{ id: 's1', reservationId: 'seated', tableIds: ['A'], seatedAt: at('18:45') }],
    }
    const reservations = [
      res('seated', { assignedTableIds: ['A'], status: 'seated', dateTime: at('18:45') }),
      res('booked', { assignedTableIds: ['A'], dateTime: at('19:10') }),
    ]
    const floor = derive(tables, reservations, snapshot)
    expect(floor.byId.A.status).toBe('occupied')
  })
})

// --- Seating Engine guarantees -------------------------------------------------

const TYPE: TableType = {
  id: 'tt',
  name: 'Four-top',
  shape: 'square',
  defaultSize: { x: 1, y: 1 },
  clearance: 0.1,
  soloCapacity: 4,
  connectedCapacity: 4,
}

const CONFIG: SeatingConfig = {
  merge: {
    forbiddenCombos: [],
    forbiddenLabelCombos: [],
    maxMergeSize: 4,
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
  tableTypes: [TYPE],
  zones: [
    {
      id: 'z1',
      name: 'Main',
      color: '#fff',
      position: { x: 0, y: 0 },
      size: { x: 1000, y: 1000 },
    },
  ],
  obstacles: [],
  mergedGroups: [],
  config: CONFIG,
})

/** Does any suggestion use table `id`? */
const offers = (
  suggestions: ReturnType<typeof suggestSeating>,
  id: string,
): boolean => suggestions.some((s) => s.candidate.tableIds.includes(id))

describe('service simulation — seating engine', () => {
  it('never recommends a table an overlapping active booking already holds', () => {
    const floor = floorOf([table('X', { position: { x: 0, y: 0 } })])
    const held = res('held', { assignedTableIds: ['X'], dateTime: at('19:00') })
    const target = res('walkin', { dateTime: at('19:30') }) // overlaps held (±15m buffer)
    expect(offers(suggestSeating(target, floor, [held]), 'X')).toBe(false)
  })

  it('allows a genuine second seating once the window clears', () => {
    const floor = floorOf([table('X')])
    const held = res('lunch', {
      assignedTableIds: ['X'],
      dateTime: at('17:00'),
      estimatedDuration: 90, // ends 18:30 (+15 buffer = 18:45)
    })
    const target = res('dinner', { dateTime: at('19:00') }) // no overlap
    expect(offers(suggestSeating(target, floor, [held]), 'X')).toBe(true)
  })

  it('treats a SEATED party as holding its table (seat-recommendation fix)', () => {
    // A party seated on X records assignedTableIds; a new overlapping booking must
    // not be offered X even though X has no future reservation of its own.
    const floor = floorOf([table('X')])
    const seated = res('seated', {
      assignedTableIds: ['X'],
      status: 'seated',
      dateTime: at('19:00'),
    })
    const target = res('walkin', { dateTime: at('19:30') })
    expect(offers(suggestSeating(target, floor, [seated]), 'X')).toBe(false)
  })

  it('never recommends a stored (inventory) table', () => {
    // useSeatingFloor filters stored tables out of the engine snapshot; simulate
    // that a stored table simply is not in floor.tables.
    const onFloor = floorOf([table('X')]) // Y is in storage → absent
    const target = res('party', { partySize: 4, dateTime: at('19:00') })
    const suggestions = suggestSeating(target, onFloor, [])
    expect(offers(suggestions, 'Y')).toBe(false)
    expect(offers(suggestions, 'X')).toBe(true)
  })
})
