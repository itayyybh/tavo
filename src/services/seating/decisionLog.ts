/**
 * Pure mapping helpers for the seating decision log (Phase 7).
 *
 * The engine stays pure; recording is a side effect the store performs. This
 * module just shapes engine output into loggable entries so the store doesn't
 * reach into candidate internals.
 */
import type { SeatingDecisionEntry } from '@/types'
import type { Suggestion } from './types'

/** Flatten ranked suggestions into decision-log entries. */
export function toDecisionEntries(suggestions: Suggestion[]): SeatingDecisionEntry[] {
  return suggestions.map((s) => ({
    kind: s.candidate.kind,
    tableIds: s.candidate.tableIds,
    score: s.score,
  }))
}
