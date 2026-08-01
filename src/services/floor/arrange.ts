/**
 * Cluster arrangement for runtime seatings (Phase 8, Step 3). Mirrors the editor's
 * merge behaviour: when a party is seated across several tables, snap those tables
 * into one touching line so they read as a single merged table on the floor — then
 * nudge the line clear of other tables/obstacles. Pure; the floor store applies the
 * result as position overrides (the base layout is never touched).
 *
 * The build DIRECTION is a soft, zone-driven preference (host rule): a non-smoking
 * zone builds the merged table vertically (stacked top-to-bottom), a smoking zone
 * builds it horizontally (left-to-right). "Soft" = the preferred direction is tried
 * first and used unless it can't fit clear, in which case the other direction wins.
 */
import type { ID, Obstacle, Table, TableType, Vec2, Zone } from '@/types'
import { aabb, boxBlocked } from '@/utils'

/** Overlap (world units) between touching members so borders merge seamlessly. */
const SEAM_OVERLAP = 1
const SEARCH_STEP = 20
const SEARCH_RINGS = 60

export type ArrangeDir = 'horizontal' | 'vertical'

/** Smoking policy inferred from a zone name (fallback when the field is unset). */
function smokingKindFromName(name: string | undefined): Zone['smoking'] {
  const n = name?.toLowerCase() ?? ''
  if (!n.includes('smok')) return undefined
  // Negation: "no smoking", "non-smoking", "non smoking", "nonsmoking".
  return /\bno\b|non/.test(n) ? 'non-smoking' : 'smoking'
}

/**
 * Preferred merge build direction for a zone (host rule): non-smoking builds
 * vertically, smoking horizontally. Uses the zone's explicit `smoking` field,
 * falling back to its name. Undefined when no rule applies.
 */
export function zoneArrangeDir(zone: Zone | undefined): ArrangeDir | undefined {
  const kind = zone?.smoking ?? smokingKindFromName(zone?.name)
  if (kind === 'non-smoking') return 'vertical'
  if (kind === 'smoking') return 'horizontal'
  return undefined
}

/** Round members sit worse in the middle of a line — pull them toward the ends. */
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

/**
 * Positions that lay the members out in a single touching line along `dir`
 * (horizontal = left-to-right, vertical = top-to-bottom). The cross axis is
 * centered on the anchor (or edge-aligned when no round tables are present).
 */
function arrangeCluster(
  members: Table[],
  isRound: (t: Table) => boolean,
  dir: ArrangeDir,
): Map<ID, Vec2> {
  const vertical = dir === 'vertical'
  const mainOf = (v: Vec2) => (vertical ? v.y : v.x)
  const crossOf = (v: Vec2) => (vertical ? v.x : v.y)
  const mainSize = (t: Table) => (vertical ? t.size.y : t.size.x)
  const crossSize = (t: Table) => (vertical ? t.size.x : t.size.y)

  const byPosition = [...members].sort(
    (a, b) => mainOf(a.position) - mainOf(b.position) || crossOf(a.position) - crossOf(b.position),
  )
  const sorted = pushRoundsToEnds(byPosition, isRound)
  const out = new Map<ID, Vec2>()
  const anchor = sorted[0]
  const centered = members.some(isRound)
  const crossLine = centered
    ? crossOf(anchor.position)
    : crossOf(anchor.position) - crossSize(anchor) / 2
  let edge = mainOf(anchor.position) - mainSize(anchor) / 2
  for (const m of sorted) {
    const main = edge + mainSize(m) / 2
    const cross = centered ? crossLine : crossLine + crossSize(m) / 2
    out.set(m.id, vertical ? { x: cross, y: main } : { x: main, y: cross })
    edge += mainSize(m) - SEAM_OVERLAP
  }
  return out
}

/**
 * Smallest offset that moves the whole line clear of other tables/obstacles,
 * keeping each member's chair-clearance. `ok` is false when no clear spot was
 * found within the search rings (the offset then falls back to origin).
 */
function findClearOffset(
  members: Table[],
  placed: Map<ID, Vec2>,
  otherTables: Table[],
  obstacles: Obstacle[],
  clearanceOf: (t: Table) => number,
): { offset: Vec2; ok: boolean } {
  const rowClearance = Math.max(0, ...members.map(clearanceOf))
  const blockedAt = (delta: Vec2) =>
    members.some((m) => {
      const p = placed.get(m.id)!
      const box = aabb({ x: p.x + delta.x, y: p.y + delta.y }, m.size)
      return boxBlocked(box, otherTables, obstacles, new Set(), clearanceOf, rowClearance)
    })

  if (!blockedAt({ x: 0, y: 0 })) return { offset: { x: 0, y: 0 }, ok: true }
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
    for (const c of candidates) if (!blockedAt(c)) return { offset: c, ok: true }
  }
  return { offset: { x: 0, y: 0 }, ok: false }
}

/** Apply an offset to every arranged position. */
function withOffset(arranged: Map<ID, Vec2>, offset: Vec2): Map<ID, Vec2> {
  const out = new Map<ID, Vec2>()
  for (const [id, p] of arranged) out.set(id, { x: p.x + offset.x, y: p.y + offset.y })
  return out
}

/**
 * Cluster `members` into one touching line and return each member's new center
 * position, nudged clear of `otherTables`/`obstacles`. `preferredDir` (zone rule)
 * is tried first and kept unless it can't fit clear, in which case the other
 * direction is used (soft). Defaults to horizontal when no rule applies. Returns
 * an empty map for fewer than two members.
 */
export function arrangeSeatingCluster(
  members: Table[],
  tableTypes: TableType[],
  otherTables: Table[],
  obstacles: Obstacle[],
  preferredDir?: ArrangeDir,
): Map<ID, Vec2> {
  if (members.length < 2) return new Map()
  const typeOf = (t: Table) => tableTypes.find((ty) => ty.id === t.typeId)
  const isRound = (t: Table) => typeOf(t)?.shape === 'round'
  const clearanceOf = (t: Table) => typeOf(t)?.clearance ?? 0

  // Try the preferred direction first, then the other; a clear fit wins, else the
  // preferred (blocked) layout is kept.
  const order: ArrangeDir[] = preferredDir
    ? [preferredDir, preferredDir === 'horizontal' ? 'vertical' : 'horizontal']
    : ['horizontal']
  let fallback: Map<ID, Vec2> | null = null
  for (const dir of order) {
    const arranged = arrangeCluster(members, isRound, dir)
    const { offset, ok } = findClearOffset(members, arranged, otherTables, obstacles, clearanceOf)
    const positioned = withOffset(arranged, offset)
    if (ok) return positioned
    if (!fallback) fallback = positioned
  }
  return fallback ?? new Map()
}
