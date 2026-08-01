/**
 * Cluster arrangement for runtime seatings (Phase 8, Step 3). Mirrors the editor's
 * merge behaviour: when a party is seated across several tables, snap those tables
 * into one touching line so they read as a single merged table on the floor — then
 * nudge the line clear of other tables/obstacles. Pure; the floor store applies the
 * result as position + rotation overrides (the base layout is never touched).
 *
 * The build DIRECTION is a soft, zone-driven preference (host rule): a non-smoking
 * zone builds the merged table vertically (stacked top-to-bottom), a smoking zone
 * builds it horizontally (left-to-right). "Soft" = the preferred direction is tried
 * first and used unless it can't fit clear, in which case the other direction wins.
 *
 * In a vertical build, rectangular members are rotated 90° so they stand tall and
 * connect on their width edge — otherwise a wide table would sit sideways and break
 * the column. Round tables are orientation-neutral and never rotated.
 */
import type { ID, Obstacle, Table, TableType, Vec2, Zone } from '@/types'
import { aabb, boxBlocked } from '@/utils'

/** Overlap (world units) between touching members so borders merge seamlessly. */
const SEAM_OVERLAP = 1
const SEARCH_STEP = 20
const SEARCH_RINGS = 60

export type ArrangeDir = 'horizontal' | 'vertical'

/** A member's placement in the cluster: center, rotation, and on-floor footprint. */
export interface Placement {
  position: Vec2
  rotation: number
  /** Axis-aligned footprint after rotation (for clearance/overlap tests). */
  footprint: Vec2
}

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
 * Lay members out in one touching line along `dir`. Horizontal keeps each table's
 * orientation; vertical rotates rectangles 90° so they stand tall. The cross axis
 * is centered on the anchor (or edge-aligned when no round tables are present).
 */
function arrangeCluster(
  members: Table[],
  isRound: (t: Table) => boolean,
  dir: ArrangeDir,
): Map<ID, Placement> {
  const vertical = dir === 'vertical'
  // On-floor footprint + rotation: a vertical build stands rectangles upright.
  const footprintOf = (t: Table): { footprint: Vec2; rotation: number } =>
    vertical && !isRound(t)
      ? { footprint: { x: t.size.y, y: t.size.x }, rotation: 90 }
      : { footprint: { x: t.size.x, y: t.size.y }, rotation: 0 }
  const fp = new Map(members.map((m) => [m.id, footprintOf(m)]))

  const mainOf = (v: Vec2) => (vertical ? v.y : v.x)
  const crossOf = (v: Vec2) => (vertical ? v.x : v.y)
  const mainSize = (m: Table) => (vertical ? fp.get(m.id)!.footprint.y : fp.get(m.id)!.footprint.x)
  const crossSize = (m: Table) => (vertical ? fp.get(m.id)!.footprint.x : fp.get(m.id)!.footprint.y)

  const byPosition = [...members].sort(
    (a, b) => mainOf(a.position) - mainOf(b.position) || crossOf(a.position) - crossOf(b.position),
  )
  const sorted = pushRoundsToEnds(byPosition, isRound)
  const out = new Map<ID, Placement>()
  const anchor = sorted[0]
  const centered = members.some(isRound)
  const crossLine = centered
    ? crossOf(anchor.position)
    : crossOf(anchor.position) - crossSize(anchor) / 2
  let edge = mainOf(anchor.position) - mainSize(anchor) / 2
  for (const m of sorted) {
    const main = edge + mainSize(m) / 2
    const cross = centered ? crossLine : crossLine + crossSize(m) / 2
    const position = vertical ? { x: cross, y: main } : { x: main, y: cross }
    out.set(m.id, { position, rotation: fp.get(m.id)!.rotation, footprint: fp.get(m.id)!.footprint })
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
  placed: Map<ID, Placement>,
  otherTables: Table[],
  obstacles: Obstacle[],
  clearance: number,
): { offset: Vec2; ok: boolean } {
  const blockedAt = (delta: Vec2) =>
    [...placed.values()].some((p) => {
      const box = aabb({ x: p.position.x + delta.x, y: p.position.y + delta.y }, p.footprint)
      return boxBlocked(box, otherTables, obstacles, new Set(), undefined, clearance)
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

/** Apply an offset to every placement's center. */
function withOffset(placed: Map<ID, Placement>, offset: Vec2): Map<ID, Placement> {
  const out = new Map<ID, Placement>()
  for (const [id, p] of placed) {
    out.set(id, { ...p, position: { x: p.position.x + offset.x, y: p.position.y + offset.y } })
  }
  return out
}

/**
 * Cluster `members` into one touching line and return each member's placement
 * (center + rotation), nudged clear of `otherTables`/`obstacles`. `preferredDir`
 * (zone rule) is tried first and kept unless it can't fit clear, in which case the
 * other direction is used (soft). Defaults to horizontal when no rule applies.
 * Returns an empty map for fewer than two members.
 */
export function arrangeSeatingCluster(
  members: Table[],
  tableTypes: TableType[],
  otherTables: Table[],
  obstacles: Obstacle[],
  preferredDir?: ArrangeDir,
): Map<ID, Placement> {
  if (members.length < 2) return new Map()
  const typeOf = (t: Table) => tableTypes.find((ty) => ty.id === t.typeId)
  const isRound = (t: Table) => typeOf(t)?.shape === 'round'
  const clearance = Math.max(0, ...members.map((m) => typeOf(m)?.clearance ?? 0))

  // Try the preferred direction first, then the other; a clear fit wins, else the
  // preferred (blocked) layout is kept.
  const order: ArrangeDir[] = preferredDir
    ? [preferredDir, preferredDir === 'horizontal' ? 'vertical' : 'horizontal']
    : ['horizontal']
  let fallback: Map<ID, Placement> | null = null
  for (const dir of order) {
    const arranged = arrangeCluster(members, isRound, dir)
    const { offset, ok } = findClearOffset(arranged, otherTables, obstacles, clearance)
    const positioned = withOffset(arranged, offset)
    if (ok) return positioned
    if (!fallback) fallback = positioned
  }
  return fallback ?? new Map()
}
