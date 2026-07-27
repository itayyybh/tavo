import type { Table, TableType } from '@/types'

/**
 * Seats a single table provides: its type's connected capacity when part of a
 * merged group, otherwise its solo capacity. Because merged members contribute
 * their connected value, every total is just a sum over tables. 0 if type unknown.
 */
export function seatsForTable(table: Table, type: TableType | undefined): number {
  if (!type) return 0
  return table.mergedGroupId ? type.connectedCapacity : type.soloCapacity
}

/** Look up a table's type from a type list. */
function typeOf(table: Table, types: TableType[]): TableType | undefined {
  return types.find((t) => t.id === table.typeId)
}

/** Combined seats across a set of tables (e.g. the members of a merged group). */
export function groupCapacity(members: Table[], types: TableType[]): number {
  return members.reduce((sum, t) => sum + seatsForTable(t, typeOf(t, types)), 0)
}

export interface FloorTotals {
  tables: number
  seats: number
}

/** Total tables + seats for a set of tables. */
export function floorTotals(tables: Table[], types: TableType[]): FloorTotals {
  return {
    tables: tables.length,
    seats: tables.reduce((sum, t) => sum + seatsForTable(t, typeOf(t, types)), 0),
  }
}
