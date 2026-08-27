import type { MergedGroup, Table, TableType } from '@/types'

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

/**
 * Combined seats across a set of tables (e.g. the members of a merged group).
 * A group's manual `seats` override wins when set. Otherwise it's computed: from
 * 3 tables up, each internal join sits where a chair would go, so every join past
 * the first costs one seat (sum of connected capacities minus member count - 2:
 * a straight row of N tables has N-1 joins, and the two outer ends both keep a
 * seat, so only N-2 joins actually displace a chair).
 * A 2-table merge has just one join and keeps the plain sum.
 */
export function groupCapacity(
  members: Table[],
  types: TableType[],
  group?: MergedGroup,
): number {
  if (group?.seats != null) return group.seats
  const sum = members.reduce((total, t) => total + seatsForTable(t, typeOf(t, types)), 0)
  return members.length >= 3 ? Math.max(0, sum - (members.length - 2)) : sum
}

/**
 * Seats a HYPOTHETICAL merge of these tables would provide — used by the seating
 * engine to score merge candidates that aren't merged yet. Unlike `groupCapacity`
 * (which reads each member's current merge state), this always treats members as
 * connected, applying the same join penalty: every join past the first costs one
 * seat for 3+ tables; a 2-table merge keeps the plain sum. 0 for fewer than 2.
 */
export function hypotheticalMergeCapacity(tables: Table[], types: TableType[]): number {
  if (tables.length < 2) return 0
  const sum = tables.reduce(
    (total, t) => total + (typeOf(t, types)?.connectedCapacity ?? 0),
    0,
  )
  return tables.length >= 3 ? Math.max(0, sum - (tables.length - 2)) : sum
}

export interface FloorTotals {
  tables: number
  seats: number
}

/** Total tables + seats for a set of tables, applying the merge-join penalty per group. */
export function floorTotals(
  tables: Table[],
  types: TableType[],
  mergedGroups: MergedGroup[] = [],
): FloorTotals {
  const groupsById = new Map(mergedGroups.map((g) => [g.id, g]))
  const groups = new Map<string, Table[]>()
  let seats = 0
  for (const t of tables) {
    if (!t.mergedGroupId) {
      seats += seatsForTable(t, typeOf(t, types))
      continue
    }
    const members = groups.get(t.mergedGroupId) ?? []
    members.push(t)
    groups.set(t.mergedGroupId, members)
  }
  for (const [id, members] of groups)
    seats += groupCapacity(members, types, groupsById.get(id))
  return { tables: tables.length, seats }
}
