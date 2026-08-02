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
  /**
   * Smoking policy. Drives how merged tables build on the Live Floor: a
   * non-smoking zone stacks them vertically, a smoking zone lays them
   * horizontally (soft). Undefined = no rule (horizontal default).
   */
  smoking?: 'smoking' | 'non-smoking'
  /**
   * May tables be brought INTO or taken OUT of this zone for a cross-zone merge?
   * A tight indoor zone (e.g. Inside) sets this false — if it's full a party is
   * turned away rather than borrowing furniture; the outdoor smoking/non-smoking
   * areas set it true and may swap tables with each other (space permitting).
   * Undefined falls back to a heuristic (see `zoneAllowsRelocation`): only zones
   * with a smoking policy are relocatable by default.
   */
  allowTableRelocation?: boolean
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
  /**
   * Same as `forbiddenCombos`, but authored by table LABEL — host-readable and
   * stable across id changes (e.g. [["11","12"]]). Resolved against the current
   * layout at eval time. The host-facing way to declare forbidden sets until the
   * Phase 10 rules UI exists.
   */
  forbiddenLabelCombos?: string[][]
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
  /**
   * Zone + party-size restrictions: for a large party in a named zone, only the
   * listed combinations are allowed (e.g. Inside, 13+ → only 7+10+11+12).
   * Authored by table label / zone name (host-readable; resolved to the current
   * layout at eval time) until the Phase 10 settings UI exists.
   */
  largePartyRules?: LargePartyRule[]
}

/** A large-party seating restriction for one zone (see `MergeConfig.largePartyRules`). */
export interface LargePartyRule {
  /** Zone this rule governs, by name (e.g. "Inside"). */
  zoneName: string
  /** Applies when the party size is at least this. */
  minPartySize: number
  /** The only merges allowed in the zone at/above the threshold — table labels. */
  allowedCombos: string[][]
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
  /**
   * Max seats a table/merge may exceed the party by and still be offered — caps
   * wasted capacity. A party of 3 fits a 4- or 5-top (waste ≤ 2) but never an
   * 8-top. Applies to singles and merges alike.
   */
  maxUnderfill: number
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

/**
 * Runtime table status on the Live Floor (Phase 8). Extends the design-time
 * `TableStatus` with `cleaning` — the turnover state a table enters after a party
 * leaves. Deliberately a SEPARATE type from `TableStatus`: the editor still edits
 * only design-time statuses; `cleaning` exists only in the operational floor layer.
 */
export type FloorTableStatus = TableStatus | 'cleaning'

/**
 * A live seating (Phase 8) — a party physically occupying one or more tables for
 * the current shift. Owns the runtime merge when it spans several tables. Created
 * when the host seats a reservation; removed when the party is cleared.
 */
export interface Seating {
  id: ID
  /** The reservation being seated. */
  reservationId: ID
  /** Member table ids the party occupies (one, or several for a merge). */
  tableIds: ID[]
  /** ISO timestamp the party was seated. */
  seatedAt: string
}

/**
 * A merge that exists only for the current shift (Phase 8), not in the base
 * layout. Its lifespan is the seating that owns it (`seatingId`); when the party
 * leaves the tables stay pushed together but the merge is flagged unowned
 * (`seatingId` cleared) until the host splits or reuses it.
 */
export interface RuntimeMergedGroup {
  id: ID
  /** Sorted member table ids. */
  tableIds: ID[]
  /** The seating that owns this merge, if any. Undefined = unowned (party left). */
  seatingId?: ID
  /**
   * True when the party was merged logically but no clear spot was found to snap
   * the tables physically together (`placeMergedBlock` returned null) — the
   * tables stay where they are and the host arranges them by hand (drag, Step 4d).
   */
  needsArrange?: boolean
}

/**
 * Serializable snapshot of the Live Floor's runtime override layer (Phase 8).
 * Kept entirely separate from `LayoutSnapshot`: the base design stays read-only
 * and versioned; the floor only records what THIS shift changed on top of it.
 */
export interface FloorSnapshot {
  /** Active seatings (parties currently on the floor). */
  seatings: Seating[]
  /** Runtime merges (owned + unowned). */
  runtimeMerges: RuntimeMergedGroup[]
  /**
   * Manual runtime status overrides keyed by table id — only `cleaning` and
   * `blocked` (host-set). Occupancy is derived from `seatings`, never stored here.
   */
  statusOverrides: Record<ID, Extract<FloorTableStatus, 'cleaning' | 'blocked'>>
  /**
   * ISO timestamp a table entered `cleaning`, keyed by table id. Drives
   * auto-turnover (a table clears itself once the turnover buffer elapses).
   */
  cleaningSince: Record<ID, string>
  /** Runtime table-center positions when staff push furniture. Keyed by table id. */
  positionOverrides: Record<ID, Vec2>
  /** Runtime table rotations (degrees) when staff turn furniture. Keyed by table id. */
  rotationOverrides: Record<ID, number>
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
