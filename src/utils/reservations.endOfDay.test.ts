import { describe, it, expect } from 'vitest'
import type { Reservation, ReservationStatus } from '@/types'
import { endOfDayArchivableIds } from './reservations'

const NOW = new Date('2026-08-16T21:00:00').getTime()
const MIN = 60_000

/** Minimal reservation for the end-of-day predicate (only the read fields matter). */
function res(
  id: string,
  startOffsetMin: number,
  status: ReservationStatus,
  extra: Partial<Reservation> = {},
): Reservation {
  const dateTime = new Date(NOW + startOffsetMin * MIN).toISOString()
  return {
    id,
    guestName: id,
    partySize: 2,
    dateTime,
    estimatedDuration: 90,
    status,
    source: 'manual',
    createdAt: dateTime,
    updatedAt: dateTime,
    ...extra,
  }
}

describe('endOfDayArchivableIds', () => {
  it('is empty when there are no reservations', () => {
    expect(endOfDayArchivableIds([], NOW)).toEqual([])
  })

  it('does not fire while a booking is still active', () => {
    const list = [
      res('a', -300, 'completed'), // finished earlier today
      res('b', -60, 'seated'), // still seated → service not over
    ]
    expect(endOfDayArchivableIds(list, NOW)).toEqual([])
  })

  it('does not fire before the last window has passed', () => {
    // All terminal, but the last booking started 30m ago (90m duration → ends in 60m).
    const list = [res('a', -300, 'completed'), res('b', -30, 'completed')]
    expect(endOfDayArchivableIds(list, NOW)).toEqual([])
  })

  it('fires once every booking is terminal and past its window', () => {
    const list = [
      res('a', -300, 'completed'),
      res('b', -180, 'no_show'),
      res('c', -150, 'cancelled'),
    ]
    expect(endOfDayArchivableIds(list, NOW).sort()).toEqual(['a', 'b', 'c'])
  })

  it('never sweeps future days', () => {
    const list = [
      res('today', -300, 'completed'),
      res('tomorrow', 24 * 60, 'confirmed'), // next day booking
    ]
    // Tomorrow's booking is excluded entirely, so today's set can still be swept.
    expect(endOfDayArchivableIds(list, NOW)).toEqual(['today'])
  })

  it('ignores already-archived reservations', () => {
    const list = [
      res('a', -300, 'completed', { archived: true }),
      res('b', -200, 'completed'),
    ]
    expect(endOfDayArchivableIds(list, NOW)).toEqual(['b'])
  })

  it('sweeps a past day even when a party was left seated overnight', () => {
    // Yesterday's booking, never cleared — still `seated` past midnight. The day
    // is over, so it must be swept (this is what resets the pinned table).
    const list = [res('yesterday', -24 * 60, 'seated')]
    expect(endOfDayArchivableIds(list, NOW)).toEqual(['yesterday'])
  })

  it('sweeps past days while today is still mid-service', () => {
    const list = [
      res('yesterday', -24 * 60, 'seated'), // rolled over → swept
      res('now', -60, 'seated'), // today, still active → kept
    ]
    expect(endOfDayArchivableIds(list, NOW)).toEqual(['yesterday'])
  })
})
