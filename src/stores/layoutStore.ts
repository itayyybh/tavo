import { create } from 'zustand'
import type {
  LayoutClipboard,
  LayoutSnapshot,
  MergedGroup,
  Obstacle,
  ObstacleKind,
  Table,
  TableType,
  Vec2,
  Zone,
} from '@/types'
import {
  aabb,
  boxBlocked,
  createId,
  deriveZoneParents,
  innermostZoneAt,
  zoneDescendantIds,
  zonesById,
} from '@/utils'
import { useHistoryStore } from './historyStore'

/** Default footprint for new obstacles (world units). */
const OBSTACLE_DEFAULT_SIZE: Record<ObstacleKind, Vec2> = {
  wall: { x: 140, y: 20 },
  object: { x: 50, y: 50 },
  path: { x: 60, y: 200 },
}

/** Default footprint for a newly created zone. */
const ZONE_DEFAULT_SIZE: Vec2 = { x: 320, y: 260 }

/** Smallest a zone may shrink to (matches the editor's zone transformer). */
const ZONE_MIN_SIZE = 80
/** Inner gap kept when a zone is dropped inside another via the list. */
const ZONE_NEST_MARGIN = 28

/** Soft pastel palette cycled across zones so each area reads distinctly. */
const ZONE_PALETTE = [
  '#BFDBFE', // blue
  '#BBF7D0', // green
  '#FDE68A', // amber
  '#FBCFE8', // pink
  '#DDD6FE', // purple
  '#A5F3FC', // cyan
  '#FED7AA', // orange
  '#C7D2FE', // indigo
]
const zoneColor = (index: number) => ZONE_PALETTE[index % ZONE_PALETTE.length]

/**
 * Default configuration — seeded, not hardcoded logic (see the `data-model` skill).
 * A restaurant can later add/edit its own zones and table types (Phase 4/5).
 */
const DEFAULT_ZONES: Zone[] = [
  {
    id: 'zone-inside',
    name: 'Inside',
    color: ZONE_PALETTE[0],
    position: { x: 300, y: 240 },
    size: { x: 480, y: 360 },
  },
]

const DEFAULT_TABLE_TYPES: TableType[] = [
  {
    id: 'type-square',
    name: 'Small Square',
    shape: 'square',
    defaultSize: { x: 60, y: 60 },
    clearance: 17,
    soloCapacity: 3,
    connectedCapacity: 2,
  },
  {
    id: 'type-round',
    name: 'Round',
    shape: 'round',
    defaultSize: { x: 80, y: 80 },
    clearance: 20,
    soloCapacity: 7,
    connectedCapacity: 5,
  },
  {
    id: 'type-rect',
    name: 'Large Rectangle',
    shape: 'rectangle',
    defaultSize: { x: 140, y: 70 },
    clearance: 17,
    soloCapacity: 5,
    connectedCapacity: 4,
  },
]

/** Live editable document. */
interface LayoutState {
  // Configuration
  tableTypes: TableType[]
  // Document
  zones: Zone[]
  tables: Table[]
  mergedGroups: MergedGroup[]
  obstacles: Obstacle[]
  // Table type (configuration) mutations
  addTableType: () => string
  updateTableType: (id: string, patch: Partial<TableType>) => void
  removeTableType: (id: string) => void
  // Table mutations (each records history)
  addTable: (typeId: string, center: Vec2) => void
  updateTable: (id: string, patch: Partial<Table>) => void
  /** Patch several tables at once (one history entry) — e.g. shared merged-group status. */
  updateTables: (ids: string[], patch: Partial<Table>) => void
  moveTablesBy: (ids: string[], delta: Vec2) => void
  removeTables: (ids: string[]) => void
  /**
   * Rotate the selection 90° clockwise. A fully-selected merged group rotates as
   * one rigid body (members swing around the group's center); any other
   * selection rotates each table in place around its own center.
   */
  rotateSelection90: (ids: string[]) => void
  /** Combine 2+ tables into one logical merged group (existing groups are absorbed). */
  mergeTables: (ids: string[]) => void
  /** Dissolve a merged group back into individual tables. */
  splitGroup: (groupId: string) => void
  // Obstacle mutations
  addObstacle: (kind: ObstacleKind, center: Vec2) => void
  /** Create a freehand keep-clear path from absolute stroke points. */
  addPath: (points: Vec2[], width: number) => void
  updateObstacle: (id: string, patch: Partial<Obstacle>) => void
  removeObstacle: (id: string) => void
  // Zone mutations
  addZone: (center: Vec2) => string
  updateZone: (id: string, patch: Partial<Zone>) => void
  removeZone: (id: string) => void
  /**
   * Nest a zone inside another by repositioning it within the target (geometry
   * then derives the parent). null moves it back out to a root position.
   */
  nestZoneInto: (id: string, parentId: string | null) => void
  /** Toggle a zone's lock (hides its subtree tables, keeps the shells). */
  toggleZoneLock: (id: string) => void
  /** Manual assignment: pin selected tables to a zone, or null to return them to auto. */
  setTablesZone: (ids: string[], zoneId: string | null) => void
  /** Clone clipboard items (new ids, offset) and return the created ids for selection. */
  paste: (
    clip: LayoutClipboard,
    offset: Vec2,
  ) => { tableIds: string[]; obstacleIds: string[]; zoneIds: string[] }
  // History
  undo: () => void
  redo: () => void
  // Persistence
  loadSnapshot: (snapshot: LayoutSnapshot) => void
  snapshot: () => LayoutSnapshot
}

const history = () => useHistoryStore.getState()

/** Next numeric table label (1, 2, 3…), one past the highest existing number. */
function nextLabel(tables: Table[]): string {
  const numbers = tables.map((t) => parseInt(t.label, 10)).filter((n) => !Number.isNaN(n))
  const max = numbers.length ? Math.max(...numbers) : 0
  return String(max + 1)
}

/**
 * Tiny overlap between adjacent merged tables so their bodies fuse with no hairline
 * seam when the group is rendered (see MergedHulls).
 */
const SEAM_OVERLAP = 1

/**
 * Snap members into a touching row so a merged group reads as one continuous
 * table, joined side-by-side along their height edges (never stacked on their
 * width edges — a narrow table stacked against a wide one only touches part of
 * that edge, leaving an overhang that isn't a usable seating surface). Order is
 * preserved left-to-right by current x position. Members keep their own size.
 *
 * A round table has no flat edge — it only actually touches a neighbor at its
 * center height, so a row containing one aligns on a shared centerline instead
 * of the top edge (flush-top would put the circle's narrow curved cap against
 * the neighbor, leaving a visible gap). A row of only rects/squares keeps the
 * flush-top alignment.
 *
 * A round table also never lands strictly between two neighbors — sandwiched
 * on both sides it only ever grazes each one near a single point, worse than
 * being at an end where at least one side is open. Round members are pulled
 * to whichever end (front/back) they started closest to; everyone else keeps
 * their relative left-to-right order.
 */
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

function arrangeCluster(members: Table[], isRound: (t: Table) => boolean): Map<string, Vec2> {
  const byPosition = [...members].sort(
    (a, b) => a.position.x - b.position.x || a.position.y - b.position.y,
  )
  const sorted = pushRoundsToEnds(byPosition, isRound)
  const out = new Map<string, Vec2>()
  const anchor = sorted[0]
  const centered = members.some(isRound)
  const rowY = centered
    ? anchor.position.y
    : anchor.position.y - anchor.size.y / 2
  let edge = anchor.position.x - anchor.size.x / 2
  for (const m of sorted) {
    out.set(m.id, { x: edge + m.size.x / 2, y: centered ? rowY : rowY + m.size.y / 2 })
    edge += m.size.x - SEAM_OVERLAP
  }
  return out
}

// Grid step for the merge-placement search below, and how many rings out to try
// before giving up and just dropping the row at its default (possibly overlapping) spot.
const MERGE_SEARCH_STEP = 20
const MERGE_SEARCH_RINGS = 60

/**
 * Find the smallest offset that moves the whole arranged row clear of other
 * tables and wall/path obstacles — tried at the default spot first, then in a
 * widening ring of candidates around it, so a merge lands beside a collision
 * instead of stacking on top of it. Falls back to no offset if nothing nearby
 * is clear (a merge should never be silently blocked).
 */
function findClearOffset(
  members: Table[],
  placed: Map<string, Vec2>,
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
  for (let ring = 1; ring <= MERGE_SEARCH_RINGS; ring++) {
    const r = ring * MERGE_SEARCH_STEP
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
 * Recompute each non-pinned table's zone from containment (innermost nested zone
 * wins; '' if inside none). Pinned tables keep their manual zone.
 */
function assignZones(tables: Table[], zones: Zone[]): Table[] {
  const byId = zonesById(zones)
  return tables.map((t) => {
    if (t.zonePinned) return t
    const zoneId = innermostZoneAt(t.position, zones, byId)
    return t.zoneId === zoneId ? t : { ...t, zoneId }
  })
}

export const useLayoutStore = create<LayoutState>((set, get) => {
  /** Snapshot the current document, then apply a mutation atomically. */
  const commit = (mutate: (s: LayoutState) => Partial<LayoutState>) => {
    history().record(get().snapshot())
    set(mutate)
  }

  return {
    tableTypes: DEFAULT_TABLE_TYPES,
    zones: DEFAULT_ZONES,
    tables: [],
    mergedGroups: [],
    obstacles: [],

    snapshot: () => {
      const { tables, zones, mergedGroups, obstacles, tableTypes } = get()
      return { tables, zones, mergedGroups, obstacles, tableTypes }
    },

    addTableType: () => {
      const id = createId()
      commit((s) => {
        const type: TableType = {
          id,
          name: 'New Type',
          shape: 'square',
          defaultSize: { x: 60, y: 60 },
          clearance: 16,
          soloCapacity: 2,
          connectedCapacity: 2,
        }
        return { tableTypes: [...s.tableTypes, type] }
      })
      return id
    },

    updateTableType: (id, patch) =>
      commit((s) => ({
        tableTypes: s.tableTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })),

    removeTableType: (id) => {
      // Guard: never orphan tables. The UI disables delete while a type is in use.
      if (get().tables.some((t) => t.typeId === id)) return
      commit((s) => ({ tableTypes: s.tableTypes.filter((t) => t.id !== id) }))
    },

    addTable: (typeId, center) => {
      const type = get().tableTypes.find((t) => t.id === typeId)
      if (!type) return
      commit((s) => {
        const table: Table = {
          id: createId(),
          zoneId: '',
          typeId: type.id,
          label: nextLabel(s.tables),
          position: center,
          size: { ...type.defaultSize },
          rotation: 0,
          status: 'available',
        }
        return { tables: assignZones([...s.tables, table], s.zones) }
      })
    },

    updateTable: (id, patch) =>
      commit((s) => ({
        tables: assignZones(
          s.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)),
          s.zones,
        ),
      })),

    updateTables: (ids, patch) => {
      const idSet = new Set(ids)
      commit((s) => ({
        tables: assignZones(
          s.tables.map((t) => (idSet.has(t.id) ? { ...t, ...patch } : t)),
          s.zones,
        ),
      }))
    },

    moveTablesBy: (ids, delta) => {
      const idSet = new Set(ids)
      commit((s) => ({
        tables: assignZones(
          s.tables.map((t) =>
            idSet.has(t.id)
              ? {
                  ...t,
                  position: { x: t.position.x + delta.x, y: t.position.y + delta.y },
                }
              : t,
          ),
          s.zones,
        ),
      }))
    },

    rotateSelection90: (ids) => {
      const idSet = new Set(ids)
      if (idSet.size === 0) return
      commit((s) => {
        const selected = s.tables.filter((t) => idSet.has(t.id))
        const gid = selected.find((t) => t.mergedGroupId)?.mergedGroupId
        const isWholeGroup =
          !!gid &&
          selected.every((t) => t.mergedGroupId === gid) &&
          (s.mergedGroups.find((g) => g.id === gid)?.tableIds.length ?? 0) ===
            selected.length

        if (isWholeGroup) {
          // Rotate the group as one rigid body around its bounding-box center.
          let minX = Infinity
          let minY = Infinity
          let maxX = -Infinity
          let maxY = -Infinity
          for (const m of selected) {
            const box = aabb(m.position, m.size)
            minX = Math.min(minX, box.x)
            minY = Math.min(minY, box.y)
            maxX = Math.max(maxX, box.x + box.width)
            maxY = Math.max(maxY, box.y + box.height)
          }
          const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
          // A round table paired with a rect/square lands at an awkward angle on
          // 90° turns (its curved side never lines up the same way twice) — a
          // mixed round+flat group turns in 45° steps instead. Pure rows of one
          // family (all round, or all rect/square) keep the crisp 90° turn.
          const isRound = (t: Table) =>
            s.tableTypes.find((ty) => ty.id === t.typeId)?.shape === 'round'
          const mixed = selected.some(isRound) && selected.some((t) => !isRound(t))
          const degrees = mixed ? 45 : 90
          const rad = (degrees * Math.PI) / 180
          const cos = Math.cos(rad)
          const sin = Math.sin(rad)
          const tables = s.tables.map((t) => {
            if (!idSet.has(t.id)) return t
            const dx = t.position.x - center.x
            const dy = t.position.y - center.y
            return {
              ...t,
              position: { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos },
              rotation: (t.rotation + degrees) % 360,
            }
          })
          return { tables: assignZones(tables, s.zones) }
        }

        // Otherwise rotate each selected table in place around its own center.
        const tables = s.tables.map((t) =>
          idSet.has(t.id) ? { ...t, rotation: (t.rotation + 90) % 360 } : t,
        )
        return { tables }
      })
    },

    removeTables: (ids) => {
      const idSet = new Set(ids)
      commit((s) => {
        const mergedGroups = s.mergedGroups
          .map((g) => ({ ...g, tableIds: g.tableIds.filter((tid) => !idSet.has(tid)) }))
          .filter((g) => g.tableIds.length > 1)
        const alive = new Set(mergedGroups.map((g) => g.id))
        const tables = s.tables
          .filter((t) => !idSet.has(t.id))
          // A dissolved group leaves its lone survivor ungrouped.
          .map((t) =>
            t.mergedGroupId && !alive.has(t.mergedGroupId)
              ? { ...t, mergedGroupId: undefined }
              : t,
          )
        return { tables, mergedGroups }
      })
    },

    mergeTables: (ids) => {
      const members = [...new Set(ids)]
      if (members.length < 2) return
      const groupId = createId()
      commit((s) => {
        const memberSet = new Set(members)
        // Absorb any groups the selected tables already belong to.
        const absorbed = new Set<string>()
        for (const t of s.tables) {
          if (memberSet.has(t.id) && t.mergedGroupId) absorbed.add(t.mergedGroupId)
        }
        for (const g of s.mergedGroups) {
          if (absorbed.has(g.id)) g.tableIds.forEach((id) => memberSet.add(id))
        }
        const mergedGroups = [
          ...s.mergedGroups.filter((g) => !absorbed.has(g.id)),
          { id: groupId, tableIds: [...memberSet] },
        ]
        // Snap members into a touching line so they physically join as one table.
        const isRound = (t: Table) =>
          s.tableTypes.find((ty) => ty.id === t.typeId)?.shape === 'round'
        const mergingTables = s.tables.filter((t) => memberSet.has(t.id))
        const arranged = arrangeCluster(mergingTables, isRound)
        // The default row might land on top of another table or a wall/path —
        // nudge the whole row to the nearest clear spot instead.
        const otherTables = s.tables.filter((t) => !memberSet.has(t.id))
        const offset = findClearOffset(mergingTables, arranged, otherTables, s.obstacles)
        const placed = new Map(
          [...arranged].map(([id, p]) => [id, { x: p.x + offset.x, y: p.y + offset.y }]),
        )
        const tables = assignZones(
          s.tables.map((t) =>
            memberSet.has(t.id)
              ? {
                  ...t,
                  mergedGroupId: groupId,
                  rotation: 0,
                  position: placed.get(t.id) ?? t.position,
                }
              : t,
          ),
          s.zones,
        )
        return { mergedGroups, tables }
      })
    },

    splitGroup: (groupId) =>
      commit((s) => ({
        mergedGroups: s.mergedGroups.filter((g) => g.id !== groupId),
        tables: s.tables.map((t) =>
          t.mergedGroupId === groupId ? { ...t, mergedGroupId: undefined } : t,
        ),
      })),

    addObstacle: (kind, center) =>
      commit((s) => {
        const obstacle: Obstacle = {
          id: createId(),
          kind,
          position: center,
          size: { ...OBSTACLE_DEFAULT_SIZE[kind] },
          rotation: 0,
        }
        return { obstacles: [...s.obstacles, obstacle] }
      }),

    addPath: (points, width) => {
      if (points.length < 2) return
      const xs = points.map((p) => p.x)
      const ys = points.map((p) => p.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
      commit((s) => {
        const path: Obstacle = {
          id: createId(),
          kind: 'path',
          position: center,
          size: { x: Math.max(maxX - minX, 1), y: Math.max(maxY - minY, 1) },
          rotation: 0,
          // Store points relative to the bbox center.
          points: points.map((p) => ({ x: p.x - center.x, y: p.y - center.y })),
          brushWidth: width,
        }
        return { obstacles: [...s.obstacles, path] }
      })
    },

    updateObstacle: (id, patch) =>
      commit((s) => ({
        obstacles: s.obstacles.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      })),

    removeObstacle: (id) =>
      commit((s) => ({ obstacles: s.obstacles.filter((o) => o.id !== id) })),

    addZone: (center) => {
      const id = createId()
      commit((s) => {
        const zone: Zone = {
          id,
          name: `Zone ${s.zones.length + 1}`,
          color: zoneColor(s.zones.length),
          position: center,
          size: { ...ZONE_DEFAULT_SIZE },
        }
        const zones = deriveZoneParents([...s.zones, zone])
        return { zones, tables: assignZones(s.tables, zones) }
      })
      return id
    },

    updateZone: (id, patch) =>
      commit((s) => {
        const zones = deriveZoneParents(
          s.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)),
        )
        return { zones, tables: assignZones(s.tables, zones) }
      }),

    removeZone: (id) =>
      commit((s) => {
        // Geometry re-derives parents (children fall to the container above, or root).
        const zones = deriveZoneParents(s.zones.filter((z) => z.id !== id))
        // Tables pinned to / sitting in the removed zone fall back to auto.
        const tables = s.tables.map((t) =>
          t.zoneId === id ? { ...t, zoneId: '', zonePinned: false } : t,
        )
        return { zones, tables: assignZones(tables, zones) }
      }),

    nestZoneInto: (id, parentId) =>
      commit((s) => {
        const child = s.zones.find((z) => z.id === id)
        if (!child || parentId === id) return {}

        let moved: Zone
        if (parentId) {
          const parent = s.zones.find((z) => z.id === parentId)
          if (!parent) return {}
          // Can't nest a zone inside its own descendant.
          if (zoneDescendantIds(id, s.zones).includes(parentId)) return {}
          // Shrink to fit within the parent (keep a margin), then center it inside.
          const size = {
            x: Math.max(ZONE_MIN_SIZE, Math.min(child.size.x, parent.size.x - ZONE_NEST_MARGIN * 2)),
            y: Math.max(ZONE_MIN_SIZE, Math.min(child.size.y, parent.size.y - ZONE_NEST_MARGIN * 2)),
          }
          moved = { ...child, size, position: { ...parent.position } }
        } else {
          // Unnest: park it just outside its current parent so geometry roots it.
          const parent = child.parentId
            ? s.zones.find((z) => z.id === child.parentId)
            : undefined
          const position = parent
            ? {
                x: parent.position.x + parent.size.x / 2 + child.size.x / 2 + 40,
                y: parent.position.y,
              }
            : child.position
          moved = { ...child, position }
        }

        const zones = deriveZoneParents(
          s.zones.map((z) => (z.id === id ? moved : z)),
        )
        return { zones, tables: assignZones(s.tables, zones) }
      }),

    toggleZoneLock: (id) =>
      commit((s) => ({
        zones: s.zones.map((z) => (z.id === id ? { ...z, locked: !z.locked } : z)),
      })),

    setTablesZone: (ids, zoneId) => {
      const idSet = new Set(ids)
      commit((s) => ({
        tables:
          zoneId === null
            ? assignZones(
                s.tables.map((t) => (idSet.has(t.id) ? { ...t, zonePinned: false } : t)),
                s.zones,
              )
            : s.tables.map((t) =>
                idSet.has(t.id) ? { ...t, zonePinned: true, zoneId } : t,
              ),
      }))
    },

    paste: (clip, offset) => {
      const tableIds: string[] = []
      const obstacleIds: string[] = []
      const zoneIds: string[] = []
      const shift = (p: Vec2) => ({ x: p.x + offset.x, y: p.y + offset.y })
      commit((s) => {
        const tables = [...s.tables]
        for (const t of clip.tables) {
          const id = createId()
          tableIds.push(id)
          tables.push({
            ...t,
            id,
            zoneId: '',
            zonePinned: false,
            mergedGroupId: undefined,
            position: shift(t.position),
            label: nextLabel(tables),
          })
        }
        const obstacles = [...s.obstacles]
        for (const o of clip.obstacles) {
          const id = createId()
          obstacleIds.push(id)
          obstacles.push({ ...o, id, position: shift(o.position) })
        }
        const zones = [...s.zones]
        for (const z of clip.zones) {
          const id = createId()
          zoneIds.push(id)
          zones.push({
            ...z,
            id,
            parentId: undefined,
            name: `${z.name} copy`,
            position: shift(z.position),
          })
        }
        const derived = deriveZoneParents(zones)
        return { tables: assignZones(tables, derived), obstacles, zones: derived }
      })
      return { tableIds, obstacleIds, zoneIds }
    },

    undo: () => {
      const restored = history().undo(get().snapshot())
      if (restored) set(restored)
    },

    redo: () => {
      const restored = history().redo(get().snapshot())
      if (restored) set(restored)
    },

    loadSnapshot: (snapshot) => {
      history().reset()
      // Migrate pre-Phase-4 zones that lack geometry, then recompute assignments.
      const zones = deriveZoneParents(
        (snapshot.zones ?? []).map((z, i) => ({
          ...z,
          color: z.color ?? zoneColor(i),
          position: z.position ?? { x: 300, y: 240 },
          size: z.size ?? { ...ZONE_DEFAULT_SIZE },
        })),
      )
      set({
        tables: assignZones(snapshot.tables, zones),
        zones,
        mergedGroups: snapshot.mergedGroups ?? [],
        obstacles: snapshot.obstacles ?? [],
        // Pre-Phase-5 documents have no types — fall back to seeded defaults.
        tableTypes: snapshot.tableTypes?.length ? snapshot.tableTypes : DEFAULT_TABLE_TYPES,
      })
    },
  }
})
