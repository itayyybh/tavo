/** Seating Engine (Phase 7) — public surface. */
export {
  suggestSeating,
  explainNoFit,
  zoneHasFit,
  DEFAULT_SUGGESTION_LIMIT,
} from './suggest'
export { canSeat } from './canSeat'
export { scoreCandidate } from './score'
export { ruleScorer } from './ruleScorer'
export { generateCandidates } from './candidates'
export {
  evaluateMerge,
  MERGE_RULES,
  type MergeRule,
  type MergeRuleContext,
  type MergeRuleKind,
  type MergeEvaluation,
} from './mergeRules'
export { toDecisionEntries } from './decisionLog'
export {
  tableFootprint,
  centerDistance,
  areAdjacent,
  boundingBoxOf,
  centroidOf,
  ADJACENCY_GAP,
} from './geometry'
export type {
  SeatingFloor,
  SeatCandidate,
  Suggestion,
  SeatingScorer,
  CanSeatResult,
  SeatingReason,
} from './types'
