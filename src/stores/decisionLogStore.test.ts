import { describe, it, expect, beforeEach } from 'vitest'
import { useDecisionLogStore } from './decisionLogStore'

/**
 * Decision Log Store tests — focused on the Phase 12 repack record.
 *
 * Signed out (no active restaurant), so persistence no-ops and these exercise
 * the pure in-memory bookkeeping.
 */
describe('decisionLogStore.logRepack', () => {
  beforeEach(() => useDecisionLogStore.getState().clear())

  it('logs a repack as an override with an empty ranked set', () => {
    useDecisionLogStore.getState().logRepack('res-1', 8, 120, ['T7', 'T10'])

    const [decision, ...rest] = useDecisionLogStore.getState().decisions
    expect(rest).toHaveLength(0)
    expect(decision).toMatchObject({
      reservationId: 'res-1',
      partySize: 8,
      predictedMinutes: 120,
      ranked: [],
      chosen: ['T7', 'T10'],
      overridden: true,
    })
    // Carries an id + timestamp, and no outcome yet.
    expect(decision.id).toBeTruthy()
    expect(decision.ts).toBeTruthy()
    expect(decision.actualMinutes).toBeUndefined()
  })

  it('prepends newest-first and is graded by recordOutcome later', () => {
    const store = useDecisionLogStore.getState()
    store.logRepack('res-1', 4, 90, ['T1'])
    store.logRepack('res-2', 2, 60, ['T2'])

    expect(useDecisionLogStore.getState().decisions[0].reservationId).toBe('res-2')

    // A repack decision has `chosen`, so outcome recording stamps its duration.
    store.recordOutcome('res-1', 105)
    const graded = useDecisionLogStore
      .getState()
      .decisions.find((d) => d.reservationId === 'res-1')
    expect(graded?.actualMinutes).toBe(105)
  })
})
