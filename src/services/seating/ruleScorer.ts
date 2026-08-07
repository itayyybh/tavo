/**
 * Rule-based scorer (Phase 11 — AI preparation).
 *
 * The Phase 7 scoring logic behind the Phase 11 `SeatingScorer` interface: score
 * each candidate independently via `scoreCandidate`, then rank best-first. This
 * is the default (and today only) scorer; its behaviour is identical to the
 * inline scoring `suggestSeating` used before ranking became pluggable.
 */
import { scoreCandidate } from './score'
import type { SeatingScorer } from './types'

export const ruleScorer: SeatingScorer = {
  rank(reservation, candidates, floor) {
    return candidates
      .map((candidate) => scoreCandidate(reservation, candidate, floor))
      .sort((a, b) => b.score - a.score)
  },
}
