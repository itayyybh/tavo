import type {
  BookingRestrictions,
  OpeningHours,
  ReservationRulesConfig,
  Weekday,
  Zone,
} from '@/types'

/**
 * Booking-rule enforcement (Phase 11 — Settings shell). A pure evaluator that
 * checks a reservation draft against the restaurant's configured rules: temporary
 * closure, blackout dates, opening hours, the reservation/party window, and per-
 * zone availability. Returns structured violations (field + code + params) so the
 * caller renders them in its own i18n — no strings baked in here.
 *
 * Store-free and side-effect-free so the same logic can run on the server
 * (check-availability) later.
 */

/** Which form field a violation attaches to. */
export type BookingRuleField = 'dateTime' | 'partySize' | 'preferredZoneId'

export interface BookingRuleViolation {
  field: BookingRuleField
  /** i18n code under the `rules.` namespace. */
  code: string
  params?: Record<string, string | number>
}

export interface BookingRuleContext {
  partySize: number
  /** Canonical ISO datetime of the booking slot. */
  dateTime: string
  preferredZoneId?: string
  openingHours: OpeningHours
  rules: ReservationRulesConfig
  restrictions: BookingRestrictions
  zones: Zone[]
  /** "Now" for lead-time / same-day checks. */
  now: Date
  /** Lead-time rules (min-advance, same-day) apply to NEW bookings only. */
  isNew: boolean
}

/** Local "YYYY-MM-DD" for a date. */
function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Local "HH:mm" for a date. */
function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function evaluateBookingRules(ctx: BookingRuleContext): BookingRuleViolation[] {
  const { rules, restrictions } = ctx
  const out: BookingRuleViolation[] = []
  const at = new Date(ctx.dateTime)
  if (Number.isNaN(at.getTime())) return out // invalid datetime handled elsewhere

  const key = dateKey(at)
  const time = clock(at)

  // 1. Temporary closure — restaurant-wide kill switch.
  const closure = restrictions.closure
  if (closure.active && (closure.until == null || key < closure.until)) {
    out.push({
      field: 'dateTime',
      code: closure.until ? 'closedUntil' : 'closed',
      params: closure.until ? { until: closure.until } : undefined,
    })
  }

  // 2. Blackout dates — whole day, or a window within it.
  for (const b of restrictions.blocks) {
    if (b.date !== key) continue
    const wholeDay = !b.from || !b.to
    if (wholeDay || (time >= b.from! && time <= b.to!)) {
      out.push({ field: 'dateTime', code: 'blockedDate' })
      break
    }
  }

  // 3. Opening hours for that weekday.
  const day = ctx.openingHours[at.getDay() as Weekday]
  if (!day.open) {
    out.push({ field: 'dateTime', code: 'closedDay' })
  } else {
    if (time < day.from) {
      out.push({ field: 'dateTime', code: 'beforeOpening', params: { from: day.from } })
    } else if (!rules.allowAfterClosing) {
      if (day.lastSeating && time > day.lastSeating) {
        out.push({
          field: 'dateTime',
          code: 'afterLastSeating',
          params: { time: day.lastSeating },
        })
      } else if (time > day.to) {
        out.push({ field: 'dateTime', code: 'afterClosing', params: { time: day.to } })
      }
    }
  }

  // 4. Reservation window.
  if (rules.latestBookingTime && time > rules.latestBookingTime) {
    out.push({
      field: 'dateTime',
      code: 'afterLatest',
      params: { time: rules.latestBookingTime },
    })
  }
  if (ctx.isNew) {
    if (!rules.allowSameDay && key === dateKey(ctx.now)) {
      out.push({ field: 'dateTime', code: 'noSameDay' })
    }
    const leadMs = at.getTime() - ctx.now.getTime()
    if (leadMs < rules.minAdvanceMinutes * 60_000) {
      out.push({
        field: 'dateTime',
        code: 'tooSoon',
        params: { minutes: rules.minAdvanceMinutes },
      })
    }
  }

  // 5. Party size.
  if (ctx.partySize < rules.minPartySize) {
    out.push({ field: 'partySize', code: 'partyTooSmall', params: { min: rules.minPartySize } })
  } else if (ctx.partySize > rules.maxPartySize) {
    out.push({ field: 'partySize', code: 'partyTooLarge', params: { max: rules.maxPartySize } })
  }

  // 6. Zone availability.
  if (ctx.preferredZoneId) {
    const zone = ctx.zones.find((z) => z.id === ctx.preferredZoneId)
    if (zone && zone.bookable === false) {
      out.push({
        field: 'preferredZoneId',
        code: 'zoneClosed',
        params: { zone: zone.name },
      })
    }
  }

  return out
}
