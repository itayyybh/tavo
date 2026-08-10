import type {
  BookingRestrictions,
  DayHours,
  OpeningHours,
  ReservationRulesConfig,
} from '@/types'

/**
 * Default opening hours (Phase 11 — Settings shell). Store-free module so the
 * store, the DB mappers (to fill a missing column), and the server can share one
 * source of truth — mirrors `DEFAULT_SEATING_CONFIG`.
 *
 * Seeded for the app's launch region: open every day, closing at 23:00, no
 * last-seating cutoff. Sunday–Friday open at 08:30, Saturday at 11:00.
 */
const day = (open: boolean, from: string): DayHours => ({
  open,
  from,
  to: '23:00',
  lastSeating: null,
})

export const DEFAULT_OPENING_HOURS: OpeningHours = [
  day(true, '08:30'), // 0 Sun
  day(true, '08:30'), // 1 Mon
  day(true, '08:30'), // 2 Tue
  day(true, '08:30'), // 3 Wed
  day(true, '08:30'), // 4 Thu
  day(true, '08:30'), // 5 Fri
  day(true, '11:00'), // 6 Sat
]

/** Default reservation & party rules. Permissive by default; a host tightens them. */
export const DEFAULT_RESERVATION_RULES: ReservationRulesConfig = {
  latestBookingTime: null,
  minAdvanceMinutes: 30,
  allowSameDay: true,
  allowAfterClosing: false,
  minPartySize: 1,
  maxPartySize: 20,
  allowSplitParty: false,
  allowAltZoneSuggestions: true,
}

/** Default booking restrictions — nothing blocked, not closed. */
export const DEFAULT_BOOKING_RESTRICTIONS: BookingRestrictions = {
  blocks: [],
  recurring: [],
  closure: { active: false, until: null },
}
