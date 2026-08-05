import type {
  MergedGroup,
  Obstacle,
  ObstacleKind,
  Table,
  TableShape,
  TableStatus,
  TableType,
  Vec2,
  Zone,
} from '@/types'

/**
 * Row <-> domain mappers for the layout entities (Phase 9). Read mappers take a
 * PostgREST row; write mappers produce a ROW-shaped object (snake_case, no
 * restaurant_id) for the `replace_layout` RPC, which injects the id itself.
 */

// --- Zone ---
export interface ZoneRow {
  id: string
  name: string
  color: string
  position: Vec2
  size: Vec2
  parent_id: string | null
  smoking: string | null
  allow_table_relocation: boolean | null
}

export function zoneFromRow(r: ZoneRow): Zone {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    position: r.position,
    size: r.size,
    parentId: r.parent_id ?? undefined,
    smoking: (r.smoking as Zone['smoking']) ?? undefined,
    allowTableRelocation: r.allow_table_relocation ?? undefined,
  }
}

export function zoneToRow(z: Zone): ZoneRow {
  return {
    id: z.id,
    name: z.name,
    color: z.color,
    position: z.position,
    size: z.size,
    parent_id: z.parentId ?? null,
    smoking: z.smoking ?? null,
    allow_table_relocation: z.allowTableRelocation ?? null,
  }
}

// --- Table ---
export interface TableRow {
  id: string
  zone_id: string
  type_id: string
  label: string
  position: Vec2
  size: Vec2
  rotation: number
  status: string
  merged_group_id: string | null
  zone_pinned: boolean | null
}

export function tableFromRow(r: TableRow): Table {
  return {
    id: r.id,
    zoneId: r.zone_id,
    typeId: r.type_id,
    label: r.label,
    position: r.position,
    size: r.size,
    rotation: r.rotation,
    status: r.status as TableStatus,
    mergedGroupId: r.merged_group_id ?? undefined,
    zonePinned: r.zone_pinned ?? undefined,
  }
}

export function tableToRow(t: Table): TableRow {
  return {
    id: t.id,
    zone_id: t.zoneId,
    type_id: t.typeId,
    label: t.label,
    position: t.position,
    size: t.size,
    rotation: t.rotation,
    status: t.status,
    merged_group_id: t.mergedGroupId ?? null,
    zone_pinned: t.zonePinned ?? null,
  }
}

// --- TableType ---
export interface TableTypeRow {
  id: string
  name: string
  shape: string
  default_size: Vec2
  clearance: number
  solo_capacity: number
  connected_capacity: number
}

export function tableTypeFromRow(r: TableTypeRow): TableType {
  return {
    id: r.id,
    name: r.name,
    shape: r.shape as TableShape,
    defaultSize: r.default_size,
    clearance: r.clearance,
    soloCapacity: r.solo_capacity,
    connectedCapacity: r.connected_capacity,
  }
}

export function tableTypeToRow(t: TableType): TableTypeRow {
  return {
    id: t.id,
    name: t.name,
    shape: t.shape,
    default_size: t.defaultSize,
    clearance: t.clearance,
    solo_capacity: t.soloCapacity,
    connected_capacity: t.connectedCapacity,
  }
}

// --- Obstacle ---
export interface ObstacleRow {
  id: string
  kind: string
  label: string | null
  position: Vec2
  size: Vec2
  rotation: number
  points: Vec2[] | null
  brush_width: number | null
}

export function obstacleFromRow(r: ObstacleRow): Obstacle {
  return {
    id: r.id,
    kind: r.kind as ObstacleKind,
    label: r.label ?? undefined,
    position: r.position,
    size: r.size,
    rotation: r.rotation,
    points: r.points ?? undefined,
    brushWidth: r.brush_width ?? undefined,
  }
}

export function obstacleToRow(o: Obstacle): ObstacleRow {
  return {
    id: o.id,
    kind: o.kind,
    label: o.label ?? null,
    position: o.position,
    size: o.size,
    rotation: o.rotation,
    points: o.points ?? null,
    brush_width: o.brushWidth ?? null,
  }
}

// --- MergedGroup (table_connections) ---
export interface ConnectionRow {
  id: string
  table_ids: string[]
  seats: number | null
  clearance: number | null
}

export function connectionFromRow(r: ConnectionRow): MergedGroup {
  return {
    id: r.id,
    tableIds: r.table_ids,
    seats: r.seats ?? undefined,
    clearance: r.clearance ?? undefined,
  }
}

export function connectionToRow(m: MergedGroup): ConnectionRow {
  return {
    id: m.id,
    table_ids: m.tableIds,
    seats: m.seats ?? null,
    clearance: m.clearance ?? null,
  }
}
