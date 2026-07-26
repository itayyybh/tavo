import { create } from 'zustand'

/** Settings Store — restaurant-level configuration (grid size, snap, table types). */
interface SettingsState {
  gridSize: number
  snapToGrid: boolean
  setGridSize: (size: number) => void
  setSnapToGrid: (snap: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  gridSize: 20,
  snapToGrid: true,
  setGridSize: (gridSize) => set({ gridSize }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
}))
