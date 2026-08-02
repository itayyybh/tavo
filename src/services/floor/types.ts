/**
 * View types for the Live Floor's effective-state model (Phase 8).
 *
 * The "effective floor" is what the host actually sees: the base layout with the
 * current shift's runtime overrides applied on top. These types describe that
 * derived view — they are computed by `deriveFloorState`, never stored.
 */
import type {
  FloorTableStatus,
  ID,
  RuntimeMergedGroup,
  Seating,
  Table,
  Vec2,
} from '@/types'

/** A base table with the current shift's overrides resolved. */
export interface EffectiveTable {
  /** The immutable base table from the layout. */
  base: Table
  /** Effective center position (runtime override, or base position). */
  position: Vec2
  /** Effective rotation in degrees (runtime override, or base rotation). */
  rotation: number
  /** Effective runtime status (occupancy/cleaning/blocked/reserved/available). */
  status: FloorTableStatus
  /** Set when the table is occupied — the seating on it. */
  seatingId?: ID
  /**
   * The reservation this table is tied to right now: the seated party when
   * `occupied`, or the upcoming booking when `reserved`. Undefined otherwise.
   */
  reservationId?: ID
  /** Effective merged-group id — a runtime merge overrides the base group. */
  mergedGroupId?: ID
  /** True when `mergedGroupId` refers to a runtime (this-shift) merge. */
  isRuntimeMerge: boolean
}

/** The whole floor resolved for the current shift. */
export interface EffectiveFloor {
  tables: EffectiveTable[]
  /** Same tables keyed by id for O(1) lookup. */
  byId: Record<ID, EffectiveTable>
  seatings: Seating[]
  runtimeMerges: RuntimeMergedGroup[]
}
