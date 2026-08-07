/**
 * Shared input/output types for the Seating Engine (Phase 7).
 *
 * `SeatingFloor` is a read-only snapshot the engine reasons over — assembled from
 * the layout + settings stores by a selector (Step 6). The engine never imports
 * stores directly, so it stays pure and testable.
 */
import type {
  ID,
  MergedGroup,
  Obstacle,
  Reservation,
  SeatingConfig,
  Table,
  TableType,
  Zone,
} from '@/types'

export interface SeatingFloor {
  /** Every table on the floor. */
  tables: Table[]
  tableTypes: TableType[]
  zones: Zone[]
  obstacles: Obstacle[]
  /** Existing merged groups from the layout. */
  mergedGroups: MergedGroup[]
  /** Seating policy (from settings): merge rules, turnover buffer, scorer weights. */
  config: SeatingConfig
}

/** A seating option the engine can offer: one table, or a set to merge. */
export interface SeatCandidate {
  kind: 'single' | 'merge'
  /** Sorted member table ids (one id for a single). */
  tableIds: ID[]
  /** The member tables. */
  tables: Table[]
  /** Seats the option provides (solo capacity, or hypothetical merge capacity). */
  seats: number
  /** Primary zone of the option (a merge shares one zone unless cross-zone is on). */
  zoneId: ID
  /**
   * When set, this option RELOCATES its table into the reservation's preferred
   * zone (a free table brought over from `zoneId`). Suggest-only — the physical
   * move happens on the Live Floor (Phase 8). Only single tables are brought.
   */
  relocateToZoneId?: ID
}

/**
 * A locale-independent reason descriptor. The engine stays pure and translatable:
 * it emits an i18n `key` (in the `reservations` namespace) plus interpolation
 * `params`; the UI resolves the display string. Also makes the decision log
 * language-agnostic.
 */
export interface SeatingReason {
  /** i18n key, e.g. `reason.exactFit`. */
  key: string
  /** Interpolation values for the key, if any. */
  params?: Record<string, string | number>
}

/** Whether a candidate can seat a reservation, with reasons when it can't. */
export interface CanSeatResult {
  ok: boolean
  /** Reasons the candidate was rejected (empty when ok). */
  reasons: SeatingReason[]
}

/** A ranked seating option returned by the engine. */
export interface Suggestion {
  candidate: SeatCandidate
  /** Higher is better. */
  score: number
  /** Reasons this option scored well (shown as chips in the UI). */
  reasons: SeatingReason[]
}

/**
 * The engine's ranking strategy (Phase 11 — AI preparation). Given the feasible
 * candidates for a reservation, return them ranked best-first as scored
 * `Suggestion`s. Candidate generation and feasibility (`canSeat`) stay fixed;
 * only the ranking is pluggable.
 *
 * Today the sole implementation is the rule-based `ruleScorer`. The interface is
 * the swap point for a future model-based scorer — rank-level (not
 * per-candidate) so such a scorer may weigh candidates jointly.
 */
export interface SeatingScorer {
  rank(
    reservation: Reservation,
    candidates: SeatCandidate[],
    floor: SeatingFloor,
  ): Suggestion[]
}
