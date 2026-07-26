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
  zoneId: ID
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

export interface Zone {
  id: ID
  name: string
}

/** A physical no-go area on the floor (wall, pillar, tree) — tables can't sit here. */
export type ObstacleKind = 'wall' | 'object'

export interface Obstacle {
  id: ID
  kind: ObstacleKind
  label?: string
  /** World-space center. */
  position: Vec2
  size: Vec2
  rotation: number
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

/** Serializable snapshot of the editable layout document (used for undo/redo & persistence). */
export interface LayoutSnapshot {
  tables: Table[]
  zones: Zone[]
  mergedGroups: MergedGroup[]
  obstacles: Obstacle[]
}
