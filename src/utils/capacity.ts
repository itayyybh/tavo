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
 * Seats a merge of these tables provides, from the table types.
 *
 * The LARGEST table (by solo capacity) anchors the merge and keeps its full SOLO
 * capacity — it doesn't shrink to its connected value just because smaller tables
 * are pushed onto it (a big round pushed against a 2-top still seats its whole
 * perimeter). Every OTHER table attaches and contributes its CONNECTED capacity.
 * Then the row penalty: from 3 tables up, each interior join past the first sits
 * where a chair would go, costing one seat (members - 2); a 2-table merge keeps
 * the plain sum. Never negative. 0 for fewer than 2 tables.
 *
 * This is the single seat model both the engine (scoring un-merged candidates)
 * and a realized group's computed capacity use, so a suggested merge and the
 * merged result always agree.
 */
function mergeSeats(tables: Table[], types: TableType[]): number {
  if (tables.length < 2) return 0
  const solo = (t: Table) => typeOf(t, types)?.soloCapacity ?? 0
  const connected = (t: Table) => typeOf(t, types)?.connectedCapacity ?? 0
  let anchor = 0
  tables.forEach((t, i) => {
    if (solo(t) > solo(tables[anchor])) anchor = i
  })
  const sum = tables.reduce(
    (total, t, i) => total + (i === anchor ? solo(t) : connected(t)),
    0,
  )
  return tables.length >= 3 ? Math.max(0, sum - (tables.length - 2)) : sum
}

/**
 * Combined seats across a set of tables (e.g. the members of a merged group).
 * A group's manual `seats` override wins when set; otherwise it's computed with
 * the shared `mergeSeats` model (anchor keeps solo, the rest connected, minus the
 * row penalty). A lone member falls back to its own seat count.
 */
export function groupCapacity(
  members: Table[],
  types: TableType[],
  group?: MergedGroup,
): number {
  if (group?.seats != null) return group.seats
  if (members.length < 2)
    return members.reduce((total, t) => total + seatsForTable(t, typeOf(t, types)), 0)
  return mergeSeats(members, types)
}

/**
 * Seats a HYPOTHETICAL merge of these tables would provide — used by the seating
 * engine to score merge candidates that aren't merged yet. Same `mergeSeats`
 * model as a realized group, so the suggestion and the result agree. 0 for fewer
 * than 2 tables.
 */
export function hypotheticalMergeCapacity(tables: Table[], types: TableType[]): number {
  return mergeSeats(tables, types)
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
