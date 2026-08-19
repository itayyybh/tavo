import { describe, it, expect } from 'vitest'
import { stableKey } from './useFloorSync'

/**
 * `stableKey` is the echo-dedup fingerprint. A snapshot we save comes back
 * through Postgres `jsonb` with object keys reordered and undefined-valued keys
 * dropped; the fingerprint must be blind to both so our own echo is recognised
 * and not re-applied (which was re-merging the floor a beat after an undo).
 */
describe('stableKey', () => {
  it('is independent of object key order', () => {
    expect(stableKey({ a: 1, b: 2 })).toBe(stableKey({ b: 2, a: 1 }))
  })

  it('treats an undefined-valued key as absent (JSON/jsonb parity)', () => {
    // A runtime merge round-trips losing its `seatingId: undefined`.
    const local = { id: 'm1', tableIds: ['t1', 't2'], seatingId: undefined }
    const echo = { id: 'm1', tableIds: ['t1', 't2'] }
    expect(stableKey(local)).toBe(stableKey(echo))
  })

  it('preserves array order (seatings / tableIds are meaningful)', () => {
    expect(stableKey(['t1', 't2'])).not.toBe(stableKey(['t2', 't1']))
  })

  it('distinguishes genuinely different content', () => {
    const merged = { runtimeMerges: [{ id: 'm1', tableIds: ['t1', 't2'] }] }
    const split = { runtimeMerges: [] }
    expect(stableKey(merged)).not.toBe(stableKey(split))
  })

  it('dedups a full snapshot echoed with reordered + dropped keys', () => {
    const localSnapshot = {
      seatings: [],
      runtimeMerges: [{ id: 'm1', tableIds: ['t2', 't1'], seatingId: undefined }],
      statusOverrides: { t9: 'blocked' },
      cleaningSince: {},
      positionOverrides: { t1: { x: 1, y: 2 } },
      rotationOverrides: {},
    }
    // Same content as the DB would return it: keys reordered, undefined dropped.
    const echo = {
      rotationOverrides: {},
      positionOverrides: { t1: { y: 2, x: 1 } },
      statusOverrides: { t9: 'blocked' },
      runtimeMerges: [{ tableIds: ['t2', 't1'], id: 'm1' }],
      cleaningSince: {},
      seatings: [],
    }
    expect(stableKey(localSnapshot)).toBe(stableKey(echo))
  })
})
