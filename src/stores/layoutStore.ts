import { create } from 'zustand'
import type {
  LayoutSnapshot,
  MergedGroup,
  Obstacle,
  ObstacleKind,
  Table,
  TableType,
  Vec2,
  Zone,
} from '@/types'
import { createId } from '@/utils'
import { useHistoryStore } from './historyStore'

/** Default footprint for new obstacles (world units). */
const OBSTACLE_DEFAULT_SIZE: Record<ObstacleKind, Vec2> = {
  wall: { x: 140, y: 20 },
  object: { x: 50, y: 50 },
}

/**
 * Default configuration — seeded, not hardcoded logic (see the `data-model` skill).
 * A restaurant can later add/edit its own zones and table types (Phase 4/5).
 */
const DEFAULT_ZONES: Zone[] = [{ id: 'zone-inside', name: 'Inside' }]

const DEFAULT_TABLE_TYPES: TableType[] = [
  {
    id: 'type-square',
    name: 'Small Square',
    shape: 'square',
    defaultSize: { x: 60, y: 60 },
    clearance: 20,
    soloCapacity: 3,
    connectedCapacity: 2,
  },
  {
    id: 'type-round',
    name: 'Round',
    shape: 'round',
    defaultSize: { x: 80, y: 80 },
    clearance: 28,
    soloCapacity: 7,
    connectedCapacity: 5,
  },
  {
    id: 'type-rect',
    name: 'Large Rectangle',
    shape: 'rectangle',
    defaultSize: { x: 120, y: 70 },
    clearance: 20,
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
  addTable: (typeId: string, center: Vec2, zoneId?: string) => void
  updateTable: (id: string, patch: Partial<Table>) => void
  moveTablesBy: (ids: string[], delta: Vec2) => void
  removeTables: (ids: string[]) => void
  // Obstacle mutations
  addObstacle: (kind: ObstacleKind, center: Vec2) => void
  updateObstacle: (id: string, patch: Partial<Obstacle>) => void
  removeObstacle: (id: string) => void
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

    addTable: (typeId, center, zoneId) => {
      const type = get().tableTypes.find((t) => t.id === typeId)
      if (!type) return
      commit((s) => {
        const table: Table = {
          id: createId(),
          zoneId: zoneId ?? s.zones[0]?.id ?? 'zone-inside',
          typeId: type.id,
          label: nextLabel(s.tables),
          position: center,
          size: { ...type.defaultSize },
          rotation: 0,
          status: 'available',
        }
        return { tables: [...s.tables, table] }
      })
    },

    updateTable: (id, patch) =>
      commit((s) => ({
        tables: s.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })),

    moveTablesBy: (ids, delta) => {
      const idSet = new Set(ids)
      commit((s) => ({
        tables: s.tables.map((t) =>
          idSet.has(t.id)
            ? { ...t, position: { x: t.position.x + delta.x, y: t.position.y + delta.y } }
            : t,
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
      set({
        tables: snapshot.tables,
        zones: snapshot.zones,
        mergedGroups: snapshot.mergedGroups,
        obstacles: snapshot.obstacles ?? [],
      })
    },
  }
})
