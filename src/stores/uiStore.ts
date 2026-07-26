import { create } from 'zustand'
import type { Vec2 } from '@/types'

export type Theme = 'light' | 'dark'

export interface Viewport {
  pan: Vec2
  zoom: number
}

/** UI Store — transient interface state (selection, viewport, theme). */
interface UIState {
  theme: Theme
  selectedTableIds: string[]
  selectedObstacleId: string | null
  selectedZoneId: string | null
  viewport: Viewport
  stageSize: { width: number; height: number }
  toggleTheme: () => void
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string, additive: boolean) => void
  selectObstacle: (id: string | null) => void
  selectZone: (id: string | null) => void
  clearSelection: () => void
  setViewport: (viewport: Viewport) => void
  setStageSize: (size: { width: number; height: number }) => void
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'light',
  selectedTableIds: [],
  selectedObstacleId: null,
  selectedZoneId: null,
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  stageSize: { width: 0, height: 0 },

  toggleTheme: () =>
    set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),

  setSelection: (ids) =>
    set({ selectedTableIds: ids, selectedObstacleId: null, selectedZoneId: null }),
  toggleSelection: (id, additive) =>
    set((state) => {
      if (!additive)
        return { selectedTableIds: [id], selectedObstacleId: null, selectedZoneId: null }
      const has = state.selectedTableIds.includes(id)
      return {
        selectedObstacleId: null,
        selectedZoneId: null,
        selectedTableIds: has
          ? state.selectedTableIds.filter((x) => x !== id)
          : [...state.selectedTableIds, id],
      }
    }),
  selectObstacle: (id) =>
    set({ selectedObstacleId: id, selectedTableIds: [], selectedZoneId: null }),
  selectZone: (id) =>
    set({ selectedZoneId: id, selectedTableIds: [], selectedObstacleId: null }),
  clearSelection: () =>
    set({ selectedTableIds: [], selectedObstacleId: null, selectedZoneId: null }),

  setViewport: (viewport) => set({ viewport }),
  setStageSize: (stageSize) => set({ stageSize }),
}))
