import type { ID, ReservationSource, ReservationStatus } from '@/types'
import type { NewReservation } from '@/stores/reservationStore'
import { combineDateTime, toDateKey } from '@/utils'

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
const STATUSES: ReservationStatus[] = [
  'confirmed',
  'confirmed',
  'confirmed',
  'arrived',
]

const SOURCES: ReservationSource[] = ['manual', 'phone', 'walk_in', 'website', 'google']

// Party sizes weighted toward LARGER parties so seeding exercises table fitting:
// merges, the under-fill slack, and large-party rules (e.g. Inside 13+). One per
// sample, in index order.
const PARTY_SIZES = [2, 4, 6, 3, 8, 10, 5, 12, 4, 15, 6, 9, 2, 14, 7, 11, 3, 13, 5, 16]

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
 * Build up to 20 varied reservations SPREAD evenly across the zones and across
 * the whole service timeline, while RESPECTING each zone's table capacity
 * (same-day active). Zones are filled round-robin (not packed first-zone-first),
 * and each zone's bookings are staggered across the evening slots so the floor
 * and the load chart show activity everywhere — not one busy corner. When a
 * zone's whole window is full, that guest spills to any zone with room; if the
 * whole window is exhausted, fewer than 20 are returned.
 */
export function buildSampleReservations(zones: ZoneCapacity[]): NewReservation[] {
  const available = zones.length ? zones : [{ id: 'zone-inside', capacity: 3 }]
  const zoneCount = available.length
  // Remaining capacity per `${zoneId}|${dayOffset}`.
  const remaining = new Map<string, number>()
  const capacityOf = (zoneId: ID) =>
    available.find((z) => z.id === zoneId)?.capacity ?? 0
  const roomAt = (zoneId: ID, offset: number) =>
    remaining.get(`${zoneId}|${offset}`) ?? capacityOf(zoneId)
  const take = (zoneId: ID, offset: number) =>
    remaining.set(`${zoneId}|${offset}`, roomAt(zoneId, offset) - 1)

  // Earliest day this zone still has room on (spills to later days when today
  // fills), or null when the zone is full across the whole window.
  const earliestOffset = (zoneId: ID): number | null => {
    for (let offset = 0; offset < MAX_DAYS; offset += 1) {
      if (roomAt(zoneId, offset) > 0) return offset
    }
    return null
  }
  // Any zone/day with room — the fallback when a guest's round-robin zone is full.
  const anySlot = (): { zoneId: ID; offset: number } | null => {
    for (let offset = 0; offset < MAX_DAYS; offset += 1) {
      for (const zone of available) {
        if (roomAt(zone.id, offset) > 0) return { zoneId: zone.id, offset }
      }
    }
    return null
  }

  const result: NewReservation[] = []
  for (let i = 0; i < MAX_SAMPLES; i += 1) {
    const zoneIndex = i % zoneCount
    let zoneId = available[zoneIndex].id
    let offset = earliestOffset(zoneId)
    if (offset === null) {
      const slot = anySlot()
      if (!slot) break // whole window exhausted
      zoneId = slot.zoneId
      offset = slot.offset
    }
    take(zoneId, offset)

    // Round = how many full passes over the zones we've made. Advancing the time
    // by round spreads each zone across the evening; the +zoneIndex stagger keeps
    // different zones off the exact same slot.
    const round = Math.floor(i / zoneCount)
    const time = TIMES[(round + zoneIndex) % TIMES.length]

    result.push({
      guestName: NAMES[i],
      phone: `+1 555 01${`${i}`.padStart(2, '0')}`,
      partySize: PARTY_SIZES[i % PARTY_SIZES.length],
      dateTime: combineDateTime(dayKeyForOffset(offset), time),
      estimatedDuration: [60, 90, 120, 90][i % 4],
      preferredZoneId: zoneId,
      status: STATUSES[i % STATUSES.length],
      source: SOURCES[i % SOURCES.length],
    })
  }
  return result
}
