import { create } from 'zustand'

/** Settings Store — restaurant-level configuration (grid size, snap, table types). */
interface SettingsState {
  gridSize: number
  snapToGrid: boolean
  /** Brush width (world units) for freehand keep-clear paths. */
  pathWidth: number
  setGridSize: (size: number) => void
  setSnapToGrid: (snap: boolean) => void
  setPathWidth: (width: number) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  gridSize: 20,
  snapToGrid: true,
  pathWidth: 40,
  setGridSize: (gridSize) => set({ gridSize }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setPathWidth: (pathWidth) => set({ pathWidth }),
}))
