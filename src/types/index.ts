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
   * When locked, this zone's whole subtree of tables is hidden on the canvas
   * while the zone shells stay visible (collapsed-folder behavior).
   */
  locked?: boolean
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
}

export interface Reservation {
  id: ID
  name: string
  phone: string
  guests: number
  /** ISO datetime. */
  time: string
  /** Expected duration in minutes. */
  durationMinutes: number
  preferredZoneId?: ID
  notes?: string
  accessibility?: boolean
  babyChair?: boolean
  smoking?: boolean
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
