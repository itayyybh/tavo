/** Live Floor effective-state model (Phase 8) — public surface. */
export { deriveFloorState, urgencyOf, type DeriveFloorInput } from './deriveFloorState'
export { summarizeFloor, type FloorSummary } from './summarize'
export {
  placeMergedBlock,
  zoneArrangeDir,
  type ArrangeDir,
  type ClusterResult,
  type Placement,
} from './arrange'
export type { EffectiveFloor, EffectiveTable, TableUrgency } from './types'
