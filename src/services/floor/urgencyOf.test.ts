import { describe, it, expect } from 'vitest'
import { urgencyOf } from './deriveFloorState'
import { DEFAULT_URGENCY_THRESHOLDS } from '@/services/settings/defaults'

describe('urgencyOf', () => {
  it('buckets by the default thresholds (30/15/5)', () => {
    expect(urgencyOf(-1)).toBe('overdue')
    expect(urgencyOf(0)).toBe('imminent')
    expect(urgencyOf(5)).toBe('imminent')
    expect(urgencyOf(6)).toBe('due')
    expect(urgencyOf(15)).toBe('due')
    expect(urgencyOf(16)).toBe('soon')
    expect(urgencyOf(30)).toBe('soon')
    expect(urgencyOf(31)).toBeUndefined()
  })

  it('honors custom thresholds', () => {
    const t = { soon: 60, due: 40, imminent: 20 }
    expect(urgencyOf(-1, t)).toBe('overdue')
    expect(urgencyOf(20, t)).toBe('imminent')
    expect(urgencyOf(21, t)).toBe('due')
    expect(urgencyOf(40, t)).toBe('due')
    expect(urgencyOf(41, t)).toBe('soon')
    expect(urgencyOf(60, t)).toBe('soon')
    expect(urgencyOf(61, t)).toBeUndefined()
  })

  it('defaults to DEFAULT_URGENCY_THRESHOLDS when none passed', () => {
    expect(urgencyOf(10)).toBe(urgencyOf(10, DEFAULT_URGENCY_THRESHOLDS))
  })
})
