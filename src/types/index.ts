/**
 * Core domain types (see the `data-model` skill).
 * Restaurant → Zones → Tables → Merged Tables → Reservations → Rules.
 * Nothing here hardcodes capacities or restaurant-specific rules — those are configured.
 */

export type ID = string

export type TableStatus = 'available' | 'reserved' | 'occupied' | 'blocked'

export interface Vec2 {
  x: number
  y: number
}

export type TableShape = 'square' | 'round' | 'rectangle'

/** A configurable table type — capacities and geometry are defined per restaurant, never hardcoded. */
export interface TableType {
  id: ID
  name: string
  shape: TableShape
  /** Default footprint (world units) when a table of this type is created. */
  defaultSize: Vec2
  /**
   * Service clearance (world units) reserved around the table for chairs + the
   * waiter aisle. Tables may abut to connect, but can't sit in the cramped gap.
   */
  clearance: number
  /** Capacity when the table stands alone. */
  soloCapacity: number
  /** Capacity contribution when merged with other tables. */
  connectedCapacity: number
}

export interface Table {
  id: ID
  /** Effective zone. Derived from containment unless `zonePinned` is set. '' = unassigned. */
  zoneId: ID
  /** When true, `zoneId` is a manual override and ignores containment. */
  zonePinned?: boolean
  typeId: ID
  label: string
  /** World-space position of the table's CENTER (simplifies rotation & merge math). */
  position: Vec2
  size: Vec2
  /** Rotation in degrees, clockwise, about the center. */
  rotation: number
  status: TableStatus
  /** When part of a merged group, the id of that group. */
  mergedGroupId?: ID
}

/** A logical area of the floor (Inside, Outside, VIP…) with a visual boundary. */
export interface Zone {
  id: ID
  name: string
  /** Soft pastel background color (hex). */
  color: string
  /** World-space center of the zone region. */
  position: Vec2
  size: Vec2
  /**
   * Parent zone id for nesting (folder hierarchy). Undefined/'' = root.
   * A nested zone (e.g. Bar inside Inside) is a no-go region for tables that
   * don't belong to it.
   */
  parentId?: ID
}

/**
 * An area where tables can't sit. `wall`/`object` are physical barriers; `path`
 * is a walkable keep-clear lane (kitchen route, exit, aisle) — walkable but never
 * placeable, so the future auto-mapper treats it as a placement constraint, not a
 * solid barrier.
 */
export type ObstacleKind = 'wall' | 'object' | 'path'

export interface Obstacle {
  id: ID
  kind: ObstacleKind
  label?: string
  /** World-space center (also the bbox center of a freehand `path`). */
  position: Vec2
  size: Vec2
  rotation: number
  /**
   * Freehand brush stroke for `path` obstacles, as points RELATIVE to `position`
   * (so moving/copying only touches `position`). Absent for wall/object.
   */
  points?: Vec2[]
  /** Lane width (world units) for a freehand `path`. */
  brushWidth?: number
}

export interface MergedGroup {
  id: ID
  tableIds: ID[]
  /** Manual seat override for the group. Undefined = auto (computed from members). */
  seats?: number
  /** Manual clearance override (world units). Undefined = auto (max member clearance). */
  clearance?: number
}

/**
 * Reservation lifecycle. Ordered from creation to terminal states.
 * The Reservation Engine owns this; seating (Phase 7) reacts to it — it never
 * mutates it directly.
 */
export const RESERVATION_STATUSES = [
  'pending',
  'confirmed',
  'arrived',
  'seated',
  'completed',
  'cancelled',
  'no_show',
  'waitlist',
] as const
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]

/** Where a reservation came from. Only `manual` functions today; rest are Phase 12+. */
export const RESERVATION_SOURCES = [
  'manual',
  'phone',
  'walk_in',
  'website',
  'google',
] as const
export type ReservationSource = (typeof RESERVATION_SOURCES)[number]

/** Optional occasion tag — drives future VIP/upsell logic, purely descriptive now. */
export const RESERVATION_OCCASIONS = [
  'birthday',
  'anniversary',
  'business',
  'date',
  'celebration',
  'other',
] as const
export type ReservationOccasion = (typeof RESERVATION_OCCASIONS)[number]

/**
 * Optional guest metadata. Extensible bag of soft preferences — the seating
 * engine may later weight these, but nothing here is required or hardcoded.
 */
export interface ReservationPreferences {
  vip?: boolean
  wheelchair?: boolean
  highChair?: boolean
  windowSeat?: boolean
  smoking?: boolean
  /** Free-text allergy notes. */
  allergies?: string
}

/**
 * A reservation. Deliberately DECOUPLED from the Table Engine: `preferredZoneId`
 * and `preferredTableId` are plain id strings (soft hints), never object refs —
 * Phase 7's Seating Engine resolves them. This model never imports Table/Zone.
 */
export interface Reservation {
  id: ID
  guestName: string
  phone?: string
  email?: string
  partySize: number
  /** ISO datetime — canonical source of truth for both service date and arrival time. */
  dateTime: string
  /** Expected duration in minutes. */
  estimatedDuration: number
  preferredZoneId?: ID
  /** Soft seating hint for Phase 7. Plain id, no Table coupling. */
  preferredTableId?: ID
  occasion?: ReservationOccasion
  /**
   * Seating assignment (Phase 7). Member table ids set when a suggestion is
   * accepted — one id for a single table, several for a deferred merge. This only
   * RESERVES the tables; the physical merge and seating happen on the Live Floor
   * (Phase 8), so the layout is never mutated at reserve time.
   */
  assignedTableIds?: ID[]
  status: ReservationStatus
  source: ReservationSource
  preferences?: ReservationPreferences
  notes?: string
  /** ISO timestamp of creation. */
  createdAt: string
  /** ISO timestamp of last edit. */
  updatedAt: string
}

/**
 * Seating Engine merge rules (Phase 7). Everything configurable — never hardcode
 * restaurant merge logic (see the `data-model` skill). Consumed by the merge-rule
 * pipeline in `src/services/seating/mergeRules.ts`.
 */
export interface MergeConfig {
  /**
   * Exact table-id sets that may never merge together — host judgment the layout
   * geometry can't infer (e.g. "11+12 have no room"). Only the EXACT set is
   * blocked: a larger set that merely contains a forbidden set is judged on its
   * own, so {11,12} can be forbidden while {7,10,11,12} stays allowed.
   */
  forbiddenCombos: ID[][]
  /** Cap on tables per merged group. Undefined = no cap. */
  maxMergeSize?: number
  /**
   * When false (default) every member of a merge must share one zone. Flip to
   * allow the rare cross-zone merge.
   */
  allowCrossZoneMerge: boolean
  /**
   * Soft-preference strength for merging physically close tables. Used only by
   * the scorer (proximity is a preference, never a hard gate — tables may merge
   * from anywhere in the zone).
   */
  proximityWeight: number
}

/**
 * Relative weights for the seating scorer. All configurable — tuning seating
 * behaviour is a restaurant policy decision, never hardcoded.
 */
export interface SeatingWeights {
  /** Reward a tight capacity fit (fewer wasted seats). */
  capacityFit: number
  /** Reward matching the reservation's preferred zone. */
  zoneMatch: number
  /** Reward including the reservation's preferred table. */
  preferredTable: number
  /** Prefer a single table over a merge when both fit. */
  singleTable: number
}

/** Seating Engine configuration (Phase 7). */
export interface SeatingConfig {
  merge: MergeConfig
  /** Minutes reserved between two bookings on the same table (turnover). */
  turnoverBufferMin: number
  weights: SeatingWeights
}

/** One ranked option recorded in a seating decision. */
export interface SeatingDecisionEntry {
  kind: 'single' | 'merge'
  tableIds: ID[]
  score: number
}

/**
 * A logged seating decision (Phase 7). Every suggestion run and acceptance is
 * recorded so the engine's behaviour is auditable and — in Phase 11 — becomes
 * training data / decision history for AI-assisted seating.
 */
export interface SeatingDecision {
  id: ID
  reservationId: ID
  /** ISO timestamp of the decision. */
  ts: string
  partySize: number
  /** Options the engine ranked, best first. */
  ranked: SeatingDecisionEntry[]
  /** Table ids the host accepted; undefined = suggested but not accepted. */
  chosen?: ID[]
}

export interface Restaurant {
  id: ID
  name: string
  zones: Zone[]
  tableTypes: TableType[]
}

/** Items held on the editor clipboard for copy/paste/duplicate. */
export interface LayoutClipboard {
  tables: Table[]
  obstacles: Obstacle[]
  zones: Zone[]
}

/** Serializable snapshot of the editable layout document (used for undo/redo & persistence). */
export interface LayoutSnapshot {
  tables: Table[]
  zones: Zone[]
  mergedGroups: MergedGroup[]
  obstacles: Obstacle[]
  /** Optional for back-compat: pre-Phase-5 documents fall back to seeded defaults. */
  tableTypes?: TableType[]
}
