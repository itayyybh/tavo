/**
 * Cluster arrangement for runtime seatings (Phase 8, Step 3). Mirrors the editor's
 * merge behaviour: when a party is seated across several tables, snap those tables
 * into one touching row so they read as a single merged table on the floor — then
 * nudge the row clear of other tables/obstacles. Pure; the floor store applies the
 * result as position overrides (the base layout is never touched).
 */
import type { ID, Obstacle, Table, TableType, Vec2 } from '@/types'
import { aabb, boxBlocked } from '@/utils'

/** Overlap (world units) between touching members so borders merge seamlessly. */
const SEAM_OVERLAP = 1
const SEARCH_STEP = 20
const SEARCH_RINGS = 60

/** Round members sit worse in the middle of a row — pull them toward the ends. */
function pushRoundsToEnds(sorted: Table[], isRound: (t: Table) => boolean): Table[] {
  const n = sorted.length
  const front: Table[] = []
  const rest: Table[] = []
  const back: Table[] = []
  sorted.forEach((m, i) => {
    if (!isRound(m)) rest.push(m)
    else if (i < n / 2) front.push(m)
    else back.push(m)
  })
  return [...front, ...rest, ...back]
}

/** Positions that lay the members out in a single touching left-to-right row. */
function arrangeCluster(
  members: Table[],
  isRound: (t: Table) => boolean,
): Map<ID, Vec2> {
  const byPosition = [...members].sort(
    (a, b) => a.position.x - b.position.x || a.position.y - b.position.y,
  )
  const sorted = pushRoundsToEnds(byPosition, isRound)
  const out = new Map<ID, Vec2>()
  const anchor = sorted[0]
  const centered = members.some(isRound)
  const rowY = centered ? anchor.position.y : anchor.position.y - anchor.size.y / 2
  let edge = anchor.position.x - anchor.size.x / 2
  for (const m of sorted) {
    out.set(m.id, { x: edge + m.size.x / 2, y: centered ? rowY : rowY + m.size.y / 2 })
    edge += m.size.x - SEAM_OVERLAP
  }
  return out
}

/** Smallest offset that moves the whole row clear of other tables/obstacles. */
function findClearOffset(
  members: Table[],
  placed: Map<ID, Vec2>,
  otherTables: Table[],
  obstacles: Obstacle[],
): Vec2 {
  const blockedAt = (delta: Vec2) =>
    members.some((m) => {
      const p = placed.get(m.id)!
      const box = aabb({ x: p.x + delta.x, y: p.y + delta.y }, m.size)
      return boxBlocked(box, otherTables, obstacles, new Set())
    })

  if (!blockedAt({ x: 0, y: 0 })) return { x: 0, y: 0 }
  for (let ring = 1; ring <= SEARCH_RINGS; ring++) {
    const r = ring * SEARCH_STEP
    const candidates = [
      { x: r, y: 0 },
      { x: -r, y: 0 },
      { x: 0, y: r },
      { x: 0, y: -r },
      { x: r, y: r },
      { x: r, y: -r },
      { x: -r, y: r },
      { x: -r, y: -r },
    ]
    for (const c of candidates) if (!blockedAt(c)) return c
  }
  return { x: 0, y: 0 }
}

/**
 * Cluster `members` into one touching row and return each member's new center
 * position, nudged clear of `otherTables`/`obstacles`. Returns an empty map for
 * fewer than two members (a single table needs no arranging).
 */
export function arrangeSeatingCluster(
  members: Table[],
  tableTypes: TableType[],
  otherTables: Table[],
  obstacles: Obstacle[],
): Map<ID, Vec2> {
  if (members.length < 2) return new Map()
  const isRound = (t: Table) =>
    tableTypes.find((ty) => ty.id === t.typeId)?.shape === 'round'
  const arranged = arrangeCluster(members, isRound)
  const offset = findClearOffset(members, arranged, otherTables, obstacles)
  const out = new Map<ID, Vec2>()
  for (const [id, p] of arranged) out.set(id, { x: p.x + offset.x, y: p.y + offset.y })
  return out
}
