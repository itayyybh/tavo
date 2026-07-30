import type {
  ID,
  ReservationOccasion,
  ReservationPreferences,
  ReservationSource,
  ReservationStatus,
} from '@/types'
import type { NewReservation } from '@/stores/reservationStore'
import { combineDateTime, todayKey, tomorrowKey } from '@/utils'

/**
 * Dev-only fixtures — a spread of realistic reservations for manual testing.
 * NOT shipped behind any UI in production (the seed button is gated on DEV).
 */

const NAMES = [
  'Dana Levi',
  'Omar Haddad',
  'Sophie Marchetti',
  'Liam O’Brien',
  'Yuki Tanaka',
  'Noa Friedman',
  'Carlos Mendez',
  'Amara Okafor',
  'Elena Petrova',
  'Marcus Webb',
  'Priya Nair',
  'Tomás Silva',
  'Hana Kim',
  'Julien Dubois',
  'Rania Aziz',
  'Ben Carter',
  'Ingrid Larsen',
  'Diego Rossi',
  'Maya Cohen',
  'Samuel Adeyemi',
]

const TIMES = [
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
]

// Weighted toward active states so the board looks like a live service.
const STATUSES: ReservationStatus[] = [
  'pending',
  'confirmed',
  'confirmed',
  'arrived',
  'seated',
  'waitlist',
  'completed',
  'cancelled',
  'no_show',
  'confirmed',
]

const SOURCES: ReservationSource[] = ['manual', 'phone', 'walk_in', 'website', 'google']
const OCCASIONS: (ReservationOccasion | undefined)[] = [
  undefined,
  'birthday',
  undefined,
  'anniversary',
  'business',
  undefined,
  'date',
  'celebration',
]
const PREFS: ReservationPreferences[] = [
  {},
  { vip: true },
  { highChair: true },
  { wheelchair: true },
  { windowSeat: true },
  { vip: true, allergies: 'Nut allergy' },
  { smoking: true },
  {},
]

/** Build 20 varied reservations, cycling zones across the provided ids. */
export function buildSampleReservations(zoneIds: ID[]): NewReservation[] {
  const zones = zoneIds.length ? zoneIds : ['zone-inside']

  return NAMES.map((name, i) => {
    const day = i < 15 ? todayKey() : tomorrowKey()
    const dateTime = combineDateTime(day, TIMES[i % TIMES.length])
    const prefs = PREFS[i % PREFS.length]

    return {
      guestName: name,
      phone: `+1 555 01${`${i}`.padStart(2, '0')}`,
      email: i % 3 === 0 ? `${name.split(' ')[0].toLowerCase()}@example.com` : undefined,
      partySize: (i % 8) + 1,
      dateTime,
      estimatedDuration: [60, 90, 120, 150][i % 4],
      preferredZoneId: zones[i % zones.length],
      occasion: OCCASIONS[i % OCCASIONS.length],
      status: STATUSES[i % STATUSES.length],
      source: SOURCES[i % SOURCES.length],
      preferences: Object.keys(prefs).length ? prefs : undefined,
      notes: i % 5 === 0 ? 'Regular guest — prefers a quiet corner.' : undefined,
    }
  })
}
