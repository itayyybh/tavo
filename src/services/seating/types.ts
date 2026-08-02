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
}

/** Whether a candidate can seat a reservation, with reasons when it can't. */
export interface CanSeatResult {
  ok: boolean
  /** Human reasons the candidate was rejected (empty when ok). */
  reasons: string[]
}

/** A ranked seating option returned by the engine. */
export interface Suggestion {
  candidate: SeatCandidate
  /** Higher is better. */
  score: number
  /** Human reasons this option scored well (shown as chips in the UI). */
  reasons: string[]
}
