import { describe, expect, it } from 'vitest'
import { dominantUrgency } from './urgencyRamp'

describe('dominantUrgency', () => {
  it('is far when no member has a pending arrival', () => {
    expect(dominantUrgency([])).toBe('far')
    expect(dominantUrgency([undefined, undefined])).toBe('far')
  })

  it('returns the single member urgency', () => {
    expect(dominantUrgency(['soon'])).toBe('soon')
    expect(dominantUrgency([undefined, 'due'])).toBe('due')
  })

  it('picks the most pressing across the group', () => {
    expect(dominantUrgency(['soon', 'imminent', 'due'])).toBe('imminent')
    expect(dominantUrgency(['overdue', 'soon'])).toBe('overdue')
    expect(dominantUrgency([undefined, 'due', undefined, 'soon'])).toBe('due')
  })

  it('escalates strictly soon < due < imminent < overdue', () => {
    expect(dominantUrgency(['soon', 'due'])).toBe('due')
    expect(dominantUrgency(['due', 'imminent'])).toBe('imminent')
    expect(dominantUrgency(['imminent', 'overdue'])).toBe('overdue')
  })
})
