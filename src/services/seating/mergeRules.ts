/**
 * Merge-rule pipeline for the Seating Engine (Phase 7).
 *
 * A merge rule is a pure predicate over a proposed set of member tables. It
 * returns `true` when the merge is allowed, or a human reason string when it is
 * rejected (the reason is surfaced in the suggestion UI). All rules run through
 * one pipeline so there is a single place to declare merge policy — add a rule
 * by pushing one onto `MERGE_RULES`.
 *
 * Rules are split by WHEN they apply:
 * - 'membership' — governs WHICH tables may form a group. Evaluated during
 *   Phase 7 candidate generation.
 * - 'placement'  — governs WHERE the merged group may physically sit. These need
 *   geometry (footprint/adjacency) and only fire on the Live Floor (Phase 8),
 *   once tables actually move. They are registered here so policy has one home;
 *   their bodies are filled in Phase 8.
 *
 * Adjacency is deliberately NOT a rule: tables may merge from anywhere in the
 * same zone. Preferring physically close tables is a soft score factor
 * (`MergeConfig.proximityWeight`), handled by the scorer, not a gate here.
 */
import type { MergeConfig, Obstacle, Table, TableType, Zone } from '@/types'

export type MergeRuleKind = 'membership' | 'placement'

export interface MergeRuleContext {
  zones: Zone[]
  obstacles: Obstacle[]
  tableTypes: TableType[]
  /** Every table on the floor (members + others), for overlap/neighbour checks. */
  allTables: Table[]
  config: MergeConfig
}

export interface MergeRule {
  id: string
  label: string
  kind: MergeRuleKind
  /** `true` = allowed; a string = rejected, with the reason to show the host. */
  test: (members: Table[], ctx: MergeRuleContext) => true | string
}

export interface MergeEvaluation {
  ok: boolean
  /** Id of the first rule that rejected the merge, if any. */
  failedRuleId?: string
  /** Human reason for rejection, if any. */
  reason?: string
}

/* ------------------------------- membership ------------------------------- */

/** All members must share one zone unless cross-zone merging is enabled. */
const sameZone: MergeRule = {
  id: 'same-zone',
  label: 'Members share a zone',
  kind: 'membership',
  test: (members, ctx) => {
    if (ctx.config.allowCrossZoneMerge) return true
    const zoneId = members[0]?.zoneId ?? ''
    return members.every((t) => t.zoneId === zoneId)
      ? true
      : 'Tables are in different zones'
  },
}

/** Reject a set that exactly matches a host-declared forbidden combination
 * (by table id, or by label — whichever the host authored). */
const notForbidden: MergeRule = {
  id: 'forbidden-combo',
  label: 'Not a forbidden combination',
  kind: 'membership',
  test: (members, ctx) => {
    const ids = new Set(members.map((t) => t.id))
    const labels = new Set(members.map((t) => t.label))
    const exactMatch = (combo: string[], set: Set<string>) =>
      combo.length === set.size && combo.every((v) => set.has(v))
    const blocked =
      ctx.config.forbiddenCombos.some((combo) => exactMatch(combo, ids)) ||
      (ctx.config.forbiddenLabelCombos ?? []).some((combo) => exactMatch(combo, labels))
    return blocked ? 'This exact set of tables can’t be merged' : true
  },
}

/** Keep the group within the configured maximum table count. */
const withinMaxSize: MergeRule = {
  id: 'max-merge-size',
  label: 'Within max merge size',
  kind: 'membership',
  test: (members, ctx) => {
    const max = ctx.config.maxMergeSize
    return max == null || members.length <= max
      ? true
      : `A merge can’t exceed ${max} tables`
  },
}

/* -------------------------------- placement ------------------------------- */
/* Registered now, evaluated in Phase 8 (need Step 2 geometry). Bodies are
 * intentional no-ops until then. */

const stayInZoneBounds: MergeRule = {
  id: 'stay-in-zone-bounds',
  label: 'Merged group stays inside its zone',
  kind: 'placement',
  test: () => true, // TODO(phase-8): reject when the merged footprint leaves its zone
}

const noObstacleOverlap: MergeRule = {
  id: 'no-obstacle-overlap',
  label: 'Merged group clears obstacles',
  kind: 'placement',
  test: () => true, // TODO(phase-8): reject when the footprint covers a wall/object/path
}

const noTableOverlap: MergeRule = {
  id: 'no-table-overlap',
  label: 'Merged group clears other tables',
  kind: 'placement',
  test: () => true, // TODO(phase-8): reject when the footprint overlaps a non-member table
}

/* -------------------------------- pipeline -------------------------------- */

/** The full rule set. Add a rule by pushing it here. */
export const MERGE_RULES: MergeRule[] = [
  sameZone,
  notForbidden,
  withinMaxSize,
  stayInZoneBounds,
  noObstacleOverlap,
  noTableOverlap,
]

/**
 * Run a proposed merge through every rule of the given kind (default
 * 'membership'). Returns on the first failure with its reason. A merge needs at
 * least two members.
 */
export function evaluateMerge(
  members: Table[],
  ctx: MergeRuleContext,
  kind: MergeRuleKind = 'membership',
): MergeEvaluation {
  if (members.length < 2) {
    return {
      ok: false,
      failedRuleId: 'min-members',
      reason: 'A merge needs at least two tables',
    }
  }
  for (const rule of MERGE_RULES) {
    if (rule.kind !== kind) continue
    const result = rule.test(members, ctx)
    if (result !== true) {
      return { ok: false, failedRuleId: rule.id, reason: result }
    }
  }
  return { ok: true }
}
