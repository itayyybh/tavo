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
import type { ID, Table, TableType, Vec2, Zone } from '@/types'
import { placementBlocked, type PlacementContext } from '@/utils'

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
  // An explicit host choice (Settings › Zones) wins over the heuristic.
  if (zone?.arrangeDir) return zone.arrangeDir
  const kind = zone?.smoking ?? smokingKindFromName(zone?.name)
  if (kind === 'non-smoking') return 'vertical'
  if (kind === 'smoking') return 'horizontal'
  return undefined
}

/**
 * Round members lead the line: a merge that includes a round table reads as
 * round + rect + rect… (the round anchors one end). Position order is preserved
 * within the rounds and within the rects.
 */
function roundsFirst(sorted: Table[], isRound: (t: Table) => boolean): Table[] {
  return [...sorted.filter((t) => isRound(t)), ...sorted.filter((t) => !isRound(t))]
}

/**
 * Lay members out in one touching line along `dir`. Horizontal keeps each table's
 * orientation; vertical rotates rectangles 90° so they stand tall. The cross axis
 * is centered on the anchor (or edge-aligned when no round tables are present).
 *
 * `anchorId` pins which table starts the line — used for a cross-zone BRING so the
 * in-zone table keeps its place and the donor is pulled to it (into the zone),
 * rather than the line originating on the donor and dragging the in-zone table out.
 */
function arrangeCluster(
  members: Table[],
  isRound: (t: Table) => boolean,
  dir: ArrangeDir,
  anchorId?: ID,
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
  const mainSize = (m: Table) =>
    vertical ? fp.get(m.id)!.footprint.y : fp.get(m.id)!.footprint.x
  const crossSize = (m: Table) =>
    vertical ? fp.get(m.id)!.footprint.x : fp.get(m.id)!.footprint.y

  const byPosition = [...members].sort(
    (a, b) =>
      mainOf(a.position) - mainOf(b.position) ||
      crossOf(a.position) - crossOf(b.position),
  )
  let sorted = roundsFirst(byPosition, isRound)
  // Force the pinned anchor to the front so the line origins on it.
  if (anchorId) {
    const idx = sorted.findIndex((m) => m.id === anchorId)
    if (idx > 0) sorted.unshift(sorted.splice(idx, 1)[0])
    // Pinning a NON-round anchor to the front would shove a round member into
    // the middle (a round only grazes a neighbour at one point — mid-line it
    // gaps on both sides). Round belongs at an edge: with the anchor holding the
    // front, push any other round to the FAR end. (An anchor that is itself
    // round already owns the front edge — nothing to move.)
    if (!isRound(sorted[0])) {
      const rounds = sorted.filter((m, i) => i > 0 && isRound(m))
      if (rounds.length > 0) {
        const roundIds = new Set(rounds.map((m) => m.id))
        sorted = [...sorted.filter((m) => !roundIds.has(m.id)), ...rounds]
      }
    }
  }
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
    out.set(m.id, {
      position,
      rotation: fp.get(m.id)!.rotation,
      footprint: fp.get(m.id)!.footprint,
    })
    edge += mainSize(m) - SEAM_OVERLAP
  }
  return out
}

const NO_IGNORE: Set<string> = new Set()

/** Small slack (world units) so float edges / seam overlaps don't reject a fit. */
const ZONE_TOL = 0.5

type Rect = { minX: number; minY: number; maxX: number; maxY: number }

/** A zone's axis-aligned bounds (its `position` is the CENTER). */
function zoneBounds(zone: Zone): Rect {
  return {
    minX: zone.position.x - zone.size.x / 2,
    minY: zone.position.y - zone.size.y / 2,
    maxX: zone.position.x + zone.size.x / 2,
    maxY: zone.position.y + zone.size.y / 2,
  }
}

/** Union footprint box of every placement, shifted by `delta`. */
function blockBounds(placed: Map<ID, Placement>, delta: Vec2): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of placed.values()) {
    const cx = p.position.x + delta.x
    const cy = p.position.y + delta.y
    minX = Math.min(minX, cx - p.footprint.x / 2)
    minY = Math.min(minY, cy - p.footprint.y / 2)
    maxX = Math.max(maxX, cx + p.footprint.x / 2)
    maxY = Math.max(maxY, cy + p.footprint.y / 2)
  }
  return { minX, minY, maxX, maxY }
}

/** Is the whole block (at `delta`) inside the zone rect, within tolerance? */
function insideZone(placed: Map<ID, Placement>, delta: Vec2, zone: Zone): boolean {
  const b = blockBounds(placed, delta)
  const z = zoneBounds(zone)
  return (
    b.minX >= z.minX - ZONE_TOL &&
    b.minY >= z.minY - ZONE_TOL &&
    b.maxX <= z.maxX + ZONE_TOL &&
    b.maxY <= z.maxY + ZONE_TOL
  )
}

/**
 * Best-effort offset that pulls the block's bounding box inside the zone rect
 * (minimum move per axis). If the block is larger than the zone on an axis it
 * can't fully fit — it aligns to the zone's low edge, the least-bad spot. Used
 * for the fallback so a merge is at least visually inside its zone even when no
 * fully clear + contained spot was found.
 */
function clampInsideZone(placed: Map<ID, Placement>, zone: Zone): Vec2 {
  const b = blockBounds(placed, { x: 0, y: 0 })
  const z = zoneBounds(zone)
  const axis = (min: number, max: number, zMin: number, zMax: number) => {
    if (min < zMin) return zMin - min
    if (max > zMax) return zMax - max
    return 0
  }
  return {
    x: axis(b.minX, b.maxX, z.minX, z.maxX),
    y: axis(b.minY, b.maxY, z.minY, z.maxY),
  }
}

/**
 * Smallest offset that moves the whole line clear of other tables/obstacles and
 * out of foreign nested zones, keeping each member's chair-clearance. Uses the
 * shared `placementBlocked` gate — the same legality test the editor drag uses.
 * When `containZone` is set the block must also stay fully INSIDE that zone (a
 * merge may never spill out of its own zone into empty space). `ok` is false
 * when no such spot was found within the search rings.
 */
function findClearOffset(
  placed: Map<ID, Placement>,
  ctx: PlacementContext,
  clearance: number,
  containZone?: Zone,
): { offset: Vec2; ok: boolean } {
  const blockedAt = (delta: Vec2) => {
    if (containZone && !insideZone(placed, delta, containZone)) return true
    return [...placed.values()].some((p) =>
      placementBlocked(
        { x: p.position.x + delta.x, y: p.position.y + delta.y },
        p.footprint,
        NO_IGNORE,
        ctx,
        clearance,
      ),
    )
  }

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
    out.set(id, {
      ...p,
      position: { x: p.position.x + offset.x, y: p.position.y + offset.y },
    })
  }
  return out
}

/** Result of clustering: every member's placement, and whether it landed clear. */
export interface ClusterResult {
  placements: Map<ID, Placement>
  /** False when no fully clear spot was found — the fallback below still fixes
   *  member ORDER (round-at-edge), just not necessarily overlap-free. Callers
   *  surface this as the "arrange by hand" hint. */
  clear: boolean
}

/**
 * Cluster `members` into one touching line and return each member's placement
 * (center + rotation), nudged to a spot clear of other tables/obstacles/foreign
 * zones via the shared `placementBlocked` gate. `preferredDir` (zone rule) is
 * tried first, then the other direction (soft).
 *
 * When `containZone` is set the block must stay fully INSIDE that zone — a merge
 * may never spill out of its own zone. When NO clear (+ contained) spot exists in
 * either direction, returns the correctly ORDERED line (round member(s) at an
 * end) CLAMPED inside the zone as best-effort, with `clear: false`. Never
 * silently falls back to members' old, possibly out-of-order positions — a round
 * table sandwiched mid-line is worse than one in a not-perfectly-clear spot.
 * `ctx.tables` is the OTHER (non-member) tables to test against; members move
 * together. `null` only for a structurally invalid call (fewer than 2 members).
 */
export function placeMergedBlock(
  members: Table[],
  tableTypes: TableType[],
  ctx: PlacementContext,
  preferredDir?: ArrangeDir,
  anchorId?: ID,
  containZone?: Zone,
): ClusterResult | null {
  if (members.length < 2) return null
  const typeOf = (t: Table) => tableTypes.find((ty) => ty.id === t.typeId)
  const isRound = (t: Table) => typeOf(t)?.shape === 'round'
  const clearance = Math.max(0, ...members.map((m) => typeOf(m)?.clearance ?? 0))

  const order: ArrangeDir[] = preferredDir
    ? [preferredDir, preferredDir === 'horizontal' ? 'vertical' : 'horizontal']
    : ['horizontal']
  let fallback: Map<ID, Placement> | undefined
  for (const dir of order) {
    const arranged = arrangeCluster(members, isRound, dir, anchorId)
    if (!fallback) fallback = arranged
    const { offset, ok } = findClearOffset(arranged, ctx, clearance, containZone)
    if (ok) return { placements: withOffset(arranged, offset), clear: true }
  }
  // Best-effort: at least pull the (correctly ordered) line inside the zone, so a
  // merge that couldn't be placed cleanly is still visually in its zone — flagged
  // clear:false so the host is asked to finish arranging it.
  const clamped = containZone
    ? withOffset(fallback!, clampInsideZone(fallback!, containZone))
    : fallback!
  return { placements: clamped, clear: false }
}
