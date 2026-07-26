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

/** A configurable table type — capacities are defined per restaurant, never hardcoded. */
export interface TableType {
  id: ID
  name: string
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
  position: Vec2
  size: Vec2
  rotation: number
  status: TableStatus
  /** When part of a merged group, the id of that group. */
  mergedGroupId?: ID
}

export interface Zone {
  id: ID
  name: string
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
