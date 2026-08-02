import type {
  ID,
  ReservationOccasion,
  ReservationPreferences,
  ReservationSource,
  ReservationStatus,
} from '@/types'
import type { NewReservation } from '@/stores/reservationStore'
import { combineDateTime, toDateKey } from '@/utils'

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

// Only the two UI statuses, weighted toward Confirmed.
const STATUSES: ReservationStatus[] = [
  'confirmed',
  'confirmed',
  'confirmed',
  'arrived',
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

export interface ZoneCapacity {
  id: ID
  capacity: number
}

const MAX_SAMPLES = 20
const MAX_DAYS = 14

function dayKeyForOffset(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return toDateKey(d)
}

/**
 * Build up to 20 varied reservations that RESPECT each zone's table capacity
 * (same-day active). Guests are placed into the first zone/day slot with room,
 * spilling to later days as needed — so seeded data never violates the guard.
 * Returns fewer than 20 if total capacity over the window is smaller.
 */
export function buildSampleReservations(zones: ZoneCapacity[]): NewReservation[] {
  const available = zones.length ? zones : [{ id: 'zone-inside', capacity: 3 }]
  // Remaining capacity per `${zoneId}|${dayOffset}`.
  const remaining = new Map<string, number>()

  const takeSlot = (): { zoneId: ID; offset: number } | null => {
    for (let offset = 0; offset < MAX_DAYS; offset += 1) {
      for (const zone of available) {
        const key = `${zone.id}|${offset}`
        const left = remaining.get(key) ?? zone.capacity
        if (left > 0) {
          remaining.set(key, left - 1)
          return { zoneId: zone.id, offset }
        }
      }
    }
    return null
  }

  const result: NewReservation[] = []
  for (let i = 0; i < MAX_SAMPLES; i += 1) {
    const slot = takeSlot()
    if (!slot) break // out of capacity across the whole window
    const name = NAMES[i]
    const dateTime = combineDateTime(dayKeyForOffset(slot.offset), TIMES[i % TIMES.length])
    const prefs = PREFS[i % PREFS.length]

    result.push({
      guestName: name,
      phone: `+1 555 01${`${i}`.padStart(2, '0')}`,
      email: i % 3 === 0 ? `${name.split(' ')[0].toLowerCase()}@example.com` : undefined,
      partySize: (i % 8) + 1,
      dateTime,
      estimatedDuration: [60, 90, 120, 150][i % 4],
      preferredZoneId: slot.zoneId,
      occasion: OCCASIONS[i % OCCASIONS.length],
      status: STATUSES[i % STATUSES.length],
      source: SOURCES[i % SOURCES.length],
      preferences: Object.keys(prefs).length ? prefs : undefined,
      notes: i % 5 === 0 ? 'Regular guest — prefers a quiet corner.' : undefined,
    })
  }
  return result
}
