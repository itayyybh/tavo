import { describe, it, expect } from 'vitest'
import { evaluateBookingRules, type BookingRuleContext } from './bookingRules'
import type {
  BookingRestrictions,
  DayHours,
  OpeningHours,
  ReservationRulesConfig,
  Zone,
} from '@/types'

/**
 * Booking-rule enforcement tests (Phase 11). Exercises the pure evaluator that
 * gates a reservation against the restaurant's configured rules.
 */

const openDay: DayHours = { open: true, from: '08:30', to: '23:00', lastSeating: null }
const closedDay: DayHours = { ...openDay, open: false }
const allOpen: OpeningHours = [openDay, openDay, openDay, openDay, openDay, openDay, openDay]

const defRules: ReservationRulesConfig = {
  latestBookingTime: null,
  minAdvanceMinutes: 30,
  allowSameDay: true,
  allowAfterClosing: false,
  minPartySize: 1,
  maxPartySize: 20,
  allowSplitParty: false,
  allowAltZoneSuggestions: true,
}

const noRestrictions: BookingRestrictions = {
  blocks: [],
  recurring: [],
  closure: { active: false, until: null },
}

/** Restrictions builder — spreads over the empty default. */
const restr = (over: Partial<BookingRestrictions> = {}): BookingRestrictions => ({
  ...noRestrictions,
  ...over,
})

const zones: Zone[] = [
  { id: 'z1', name: 'Inside', color: '#fff', position: { x: 0, y: 0 }, size: { x: 1, y: 1 } },
  { id: 'z2', name: 'Patio', color: '#fff', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, bookable: false },
]

// Fixed "now": Wed 2026-08-05 12:00. Booking base: 2026-08-12 19:00 (a Wed, open, a week out).
const NOW = new Date('2026-08-05T12:00:00')

const base = (over: Partial<BookingRuleContext> = {}): BookingRuleContext => ({
  partySize: 2,
  dateTime: '2026-08-12T19:00:00',
  preferredZoneId: 'z1',
  openingHours: allOpen,
  rules: defRules,
  restrictions: noRestrictions,
  zones,
  now: NOW,
  isNew: true,
  ...over,
})

/** The violation codes a context produces, sorted. */
const codesFor = (ctx: BookingRuleContext) =>
  evaluateBookingRules(ctx).map((v) => v.code).sort()

describe('evaluateBookingRules', () => {
  it('passes a valid booking with no violations', () => {
    expect(codesFor(base())).toEqual([])
  })

  describe('temporary closure', () => {
    it('blocks when active indefinitely', () => {
      expect(codesFor(base({ restrictions: restr({ closure: { active: true, until: null } }) }))).toEqual(['closed'])
    })
    it('blocks a booking before the reopen date', () => {
      expect(codesFor(base({ restrictions: restr({ closure: { active: true, until: '2026-08-20' } }) }))).toEqual(['closedUntil'])
    })
    it('allows a booking on/after the reopen date', () => {
      expect(codesFor(base({ restrictions: restr({ closure: { active: true, until: '2026-08-10' } }) }))).toEqual([])
    })
  })

  describe('blackout dates', () => {
    it('blocks a whole-day blackout on the booking date', () => {
      expect(codesFor(base({ restrictions: restr({ blocks: [{ id: 'b', date: '2026-08-12', from: null, to: null }] }) }))).toEqual(['blockedDate'])
    })
    it('ignores a blackout on a different date', () => {
      expect(codesFor(base({ restrictions: restr({ blocks: [{ id: 'b', date: '2026-08-13', from: null, to: null }] }) }))).toEqual([])
    })
    it('blocks when the booking falls inside a blocked window', () => {
      expect(codesFor(base({ restrictions: restr({ blocks: [{ id: 'b', date: '2026-08-12', from: '18:00', to: '20:00' }] }) }))).toEqual(['blockedDate'])
    })
    it('allows when the booking is outside the blocked window', () => {
      expect(codesFor(base({ restrictions: restr({ blocks: [{ id: 'b', date: '2026-08-12', from: '20:00', to: '22:00' }] }) }))).toEqual([])
    })
  })

  describe('recurring closures', () => {
    // Base booking is a Wednesday (weekday 3) at 19:00.
    it('blocks a whole-day recurring closure on that weekday', () => {
      expect(codesFor(base({ restrictions: restr({ recurring: [{ id: 'r', day: 3, from: null, to: null }] }) }))).toEqual(['blockedRecurring'])
    })
    it('ignores a recurring closure on a different weekday', () => {
      expect(codesFor(base({ restrictions: restr({ recurring: [{ id: 'r', day: 1, from: null, to: null }] }) }))).toEqual([])
    })
    it('blocks when the booking falls inside a recurring window', () => {
      expect(codesFor(base({ restrictions: restr({ recurring: [{ id: 'r', day: 3, from: '18:00', to: '20:00' }] }) }))).toEqual(['blockedRecurring'])
    })
    it('allows when the booking is outside the recurring window', () => {
      expect(codesFor(base({ restrictions: restr({ recurring: [{ id: 'r', day: 3, from: '20:00', to: '22:00' }] }) }))).toEqual([])
    })
  })

  describe('VIP override', () => {
    const blockedEverything = restr({
      closure: { active: true, until: null },
      blocks: [{ id: 'b', date: '2026-08-12', from: null, to: null }],
      recurring: [{ id: 'r', day: 3, from: null, to: null }],
    })
    it('bypasses closure, blackout, and recurring for a VIP', () => {
      expect(codesFor(base({ restrictions: blockedEverything, vip: true }))).toEqual([])
    })
    it('still enforces the same restrictions for a non-VIP', () => {
      expect(codesFor(base({ restrictions: blockedEverything }))).toEqual(
        ['blockedDate', 'blockedRecurring', 'closed'].sort(),
      )
    })
    it('does not let a VIP bypass party-size limits', () => {
      expect(codesFor(base({ partySize: 99, rules: { ...defRules, maxPartySize: 4 }, vip: true }))).toEqual(['partyTooLarge'])
    })
  })

  describe('party size', () => {
    it('blocks a party over the maximum', () => {
      expect(codesFor(base({ partySize: 6, rules: { ...defRules, maxPartySize: 4 } }))).toEqual(['partyTooLarge'])
    })
    it('blocks a party under the minimum', () => {
      expect(codesFor(base({ partySize: 1, rules: { ...defRules, minPartySize: 2 } }))).toEqual(['partyTooSmall'])
    })
  })

  describe('zone availability', () => {
    it('blocks a preferred zone that is not bookable', () => {
      expect(codesFor(base({ preferredZoneId: 'z2' }))).toEqual(['zoneClosed'])
    })
  })

  describe('opening hours', () => {
    it('blocks a closed weekday', () => {
      const oh: OpeningHours = [openDay, openDay, openDay, closedDay, openDay, openDay, openDay] // Wed = 3
      expect(codesFor(base({ openingHours: oh }))).toEqual(['closedDay'])
    })
    it('blocks before opening time', () => {
      expect(codesFor(base({ dateTime: '2026-08-12T08:00:00' }))).toEqual(['beforeOpening'])
    })
    it('blocks after closing time', () => {
      expect(codesFor(base({ dateTime: '2026-08-12T23:30:00' }))).toEqual(['afterClosing'])
    })
    it('allows after closing when allowAfterClosing is on', () => {
      expect(codesFor(base({ dateTime: '2026-08-12T23:30:00', rules: { ...defRules, allowAfterClosing: true } }))).toEqual([])
    })
    it('blocks past the last-seating cutoff', () => {
      const oh: OpeningHours = allOpen.map(() => ({ ...openDay, lastSeating: '21:00' })) as OpeningHours
      expect(codesFor(base({ dateTime: '2026-08-12T21:30:00', openingHours: oh }))).toEqual(['afterLastSeating'])
    })
  })

  describe('reservation window', () => {
    it('blocks past the latest booking time', () => {
      expect(codesFor(base({ dateTime: '2026-08-12T22:00:00', rules: { ...defRules, latestBookingTime: '21:00' } }))).toEqual(['afterLatest'])
    })
    it('blocks a same-day booking when disabled', () => {
      expect(codesFor(base({ dateTime: '2026-08-05T19:00:00', rules: { ...defRules, allowSameDay: false } }))).toEqual(['noSameDay'])
    })
    it('blocks a booking inside the minimum-advance window', () => {
      expect(codesFor(base({ dateTime: '2026-08-05T12:30:00', rules: { ...defRules, minAdvanceMinutes: 120 } }))).toEqual(['tooSoon'])
    })
    it('allows a booking beyond the minimum-advance window', () => {
      expect(codesFor(base({ dateTime: '2026-08-05T15:00:00', rules: { ...defRules, minAdvanceMinutes: 120 } }))).toEqual([])
    })
    it('skips lead-time rules when editing (isNew=false)', () => {
      expect(codesFor(base({ dateTime: '2026-08-05T12:10:00', isNew: false, rules: { ...defRules, allowSameDay: false, minAdvanceMinutes: 120 } }))).toEqual([])
    })
  })

  it('ignores an invalid datetime (handled by base validation)', () => {
    expect(codesFor(base({ dateTime: 'not-a-date' }))).toEqual([])
  })
})
