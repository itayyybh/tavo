import type {
  ID,
  Reservation,
  ReservationSource,
  ReservationStatus,
  Table,
  TableType,
} from '@/types'
import type { NewReservation } from '@/stores/reservationStore'
import { combineDateTime, toDateKey, zoneRemainingSeats } from '@/utils'

/**
 * Dev-only fixtures — a spread of realistic reservations for manual testing.
 * NOT shipped behind any UI in production (the seed button is gated on DEV).
 */

const NAMES = [
  'דנה לוי',
  'עומר כהן',
  'נועה פרידמן',
  'איתי בר',
  'יעל אברהם',
  'רון שפירא',
  'מיכל דיין',
  'גיא אזולאי',
  'שירה מזרחי',
  'אורי פרץ',
  'תמר ביטון',
  'יונתן גל',
  'ליאת נחום',
  'אסף רוזן',
  'נטע חדד',
  'עידן שלום',
  'מאיה קפלן',
  'דניאל עמר',
  'הדר לביא',
  'טל וקנין',
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
const STATUSES: ReservationStatus[] = ['confirmed', 'confirmed', 'confirmed', 'arrived']

const SOURCES: ReservationSource[] = ['manual', 'phone', 'walk_in', 'website', 'google']

// Party sizes weighted toward LARGER parties so seeding exercises table fitting:
// merges, the under-fill slack, and large-party rules (e.g. Inside 13+). One per
// sample, in index order.
const PARTY_SIZES = [2, 4, 6, 3, 8, 10, 5, 12, 4, 15, 6, 9, 2, 14, 7, 11, 3, 13, 5, 16]

const MAX_SAMPLES = 20
const MAX_DAYS = 14

function dayKeyForOffset(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return toDateKey(d)
}

export interface SampleInput {
  zones: { id: ID }[]
  tables: Table[]
  tableTypes: TableType[]
  bufferMin: number
}

/**
 * Build up to 20 varied reservations SPREAD across the zones and the service
 * timeline, respecting the SAME seat-based, time-windowed zone gate the create
 * form enforces: a guest is only ever booked into their zone, and only when it
 * has enough seats free during their window. Bookings are round-robin across
 * zones and staggered across the evening; when a zone/time is full, the guest is
 * pushed to the earliest day that fits, and skipped entirely if the whole window
 * is exhausted — so fewer than 20 may be returned.
 */
export function buildSampleReservations({
  zones,
  tables,
  tableTypes,
  bufferMin,
}: SampleInput): NewReservation[] {
  const available = zones.length ? zones : [{ id: 'zone-inside' }]
  const zoneCount = available.length
  const result: NewReservation[] = []

  for (let i = 0; i < MAX_SAMPLES; i += 1) {
    const zoneIndex = i % zoneCount
    const zoneId = available[zoneIndex].id
    // Round = full passes over the zones; advancing time by round spreads each
    // zone across the evening, +zoneIndex keeps zones off the same slot.
    const round = Math.floor(i / zoneCount)
    const time = TIMES[(round + zoneIndex) % TIMES.length]
    const partySize = PARTY_SIZES[i % PARTY_SIZES.length]
    const estimatedDuration = [60, 90, 120, 90][i % 4]

    // Earliest day the zone has room for this party at this time (seat + time
    // aware, counting the reservations already built).
    for (let offset = 0; offset < MAX_DAYS; offset += 1) {
      const dateTime = combineDateTime(dayKeyForOffset(offset), time)
      const remaining = zoneRemainingSeats({
        zoneId,
        startISO: dateTime,
        durationMin: estimatedDuration,
        tables,
        tableTypes,
        reservations: result as unknown as Reservation[],
        bufferMin,
      })
      if (remaining >= partySize) {
        result.push({
          guestName: NAMES[i],
          phone: `+1 555 01${`${i}`.padStart(2, '0')}`,
          partySize,
          dateTime,
          estimatedDuration,
          preferredZoneId: zoneId,
          status: STATUSES[i % STATUSES.length],
          source: SOURCES[i % SOURCES.length],
        })
        break // placed on the earliest fitting day
      }
    }
  }
  return result
}
