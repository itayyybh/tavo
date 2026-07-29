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
  // Table mutations (each records history)
  addTable: (typeId: string, center: Vec2) => void
  updateTable: (id: string, patch: Partial<Table>) => void
  moveTablesBy: (ids: string[], delta: Vec2) => void
  removeTables: (ids: string[]) => void
  // Obstacle mutations
  addObstacle: (kind: ObstacleKind, center: Vec2) => void
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
      const { tables, zones, mergedGroups, obstacles } = get()
      return { tables, zones, mergedGroups, obstacles }
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

    removeTables: (ids) => {
      const idSet = new Set(ids)
      commit((s) => ({
        tables: s.tables.filter((t) => !idSet.has(t.id)),
        mergedGroups: s.mergedGroups
          .map((g) => ({ ...g, tableIds: g.tableIds.filter((tid) => !idSet.has(tid)) }))
          .filter((g) => g.tableIds.length > 1),
      }))
    },

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
      })
    },
  }
})
