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

/**
 * Graded arrival pressure for a table's bound upcoming booking, so the Live Floor
 * ramps its reserved visual as the guest nears: `soon` ≤30m, `due` ≤15m,
 * `imminent` ≤5m, `overdue` (arrival time passed, not yet seated).
 */
export type TableUrgency = 'soon' | 'due' | 'imminent' | 'overdue'

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
  /**
   * Set only while `status` is `available`: a booking further out than
   * `reservedLookaheadMin` still holds this table later in the shift. Lets the
   * UI hint "free now, booked at 7:30" instead of a bare seat count.
   */
  upcomingReservationId?: ID
  /**
   * Set only while `occupied`: the soonest future booking assigned to this table
   * — the second seating. Lets the UI show "who's next" without leaving the floor.
   */
  nextReservationId?: ID
  /**
   * Minutes from now until this table's bound upcoming booking (the `reserved`
   * party, or the `upcoming` one). Negative once its time has passed unseated.
   * Undefined when the table has no pending arrival.
   */
  minutesUntil?: number
  /** Graded arrival pressure of the bound upcoming booking (drives the floor ramp). */
  urgency?: TableUrgency
  /** Effective merged-group id — a runtime merge overrides the base group. */
  mergedGroupId?: ID
  /** True when `mergedGroupId` refers to a runtime (this-shift) merge. */
  isRuntimeMerge: boolean
  /**
   * True when this table is double-booked: two active reservations hold it on
   * overlapping windows. Only one can own the table's status, so the floor flags
   * the clash instead of silently hiding a booking. See `findAssignmentConflicts`.
   */
  conflict?: boolean
  /**
   * Set when a seating suggestion is being PREVIEWED on this table (Phase 12) — a
   * hypothetical assignment the host is comparing before committing, never
   * persisted. `color` is the previewed option's accent; `contested` is true when
   * more than one previewed option wants this table (only one could be seated).
   * Drawn as a dashed overlay on top of the table's real status.
   */
  preview?: { color: string; contested: boolean }
}

/**
 * A hypothetical seating option overlaid on the floor for preview (Phase 12) —
 * "how would this look" without writing an assignment. Purely a view input to
 * `deriveFloorState`; the real reservations are never touched.
 */
export interface FloorPreview {
  /** Tables the option would occupy. */
  tableIds: ID[]
  /** Distinct accent color for this option (lets several be compared at once). */
  color: string
}

/** The whole floor resolved for the current shift. */
export interface EffectiveFloor {
  tables: EffectiveTable[]
  /** Same tables keyed by id for O(1) lookup. */
  byId: Record<ID, EffectiveTable>
  seatings: Seating[]
  runtimeMerges: RuntimeMergedGroup[]
}
