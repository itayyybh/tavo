import { create } from 'zustand'
import type { Vec2 } from '@/types'

export type Theme = 'light' | 'dark'

/** Active canvas tool. `select` is the normal editor; `path` draws keep-clear lanes. */
export type EditorTool = 'select' | 'path'

export interface Viewport {
  pan: Vec2
  zoom: number
}

/** UI Store — transient interface state (selection, viewport, theme). */
interface UIState {
  theme: Theme
  tool: EditorTool
  selectedTableIds: string[]
  selectedObstacleId: string | null
  selectedZoneId: string | null
  /** When set, the canvas isolates this single zone (fit + hide everything else). */
  focusedZoneId: string | null
  viewport: Viewport
  stageSize: { width: number; height: number }
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  setTool: (tool: EditorTool) => void
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string, additive: boolean) => void
  selectObstacle: (id: string | null) => void
  selectZone: (id: string | null) => void
  clearSelection: () => void
  setFocusedZone: (id: string | null) => void
  setViewport: (viewport: Viewport) => void
  setStageSize: (size: { width: number; height: number }) => void
}

const THEME_KEY = 'floor-manager.theme'

/**
 * Resolve the startup theme: an explicit prior choice wins; otherwise honor the
 * OS preference so the app opens in the mode the manager already runs their
 * device in. SSR-safe (falls back to light when there's no window).
 */
function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply the theme to the document root AND persist it — synchronously, from the
 * store action, so the `.dark` class is flipped BEFORE React re-renders. The
 * Konva canvas reads its colors from these CSS vars via `getComputedStyle` during
 * render (they can't be Tailwind classes); if the class only toggled in a
 * post-render effect, the canvas would read the previous theme's values and lag
 * one flip behind (black tables in light mode, and vice-versa).
 */
function applyTheme(theme: Theme): Theme {
  if (typeof window !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem(THEME_KEY, theme)
  }
  return theme
}

const startupTheme = applyTheme(initialTheme())

export const useUIStore = create<UIState>((set) => ({
  theme: startupTheme,
  tool: 'select',
  selectedTableIds: [],
  selectedObstacleId: null,
  selectedZoneId: null,
  focusedZoneId: null,
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  stageSize: { width: 0, height: 0 },

  toggleTheme: () =>
    set((state) => ({ theme: applyTheme(state.theme === 'light' ? 'dark' : 'light') })),
  setTheme: (theme) => set({ theme: applyTheme(theme) }),
  setTool: (tool) => set({ tool }),

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
  setFocusedZone: (focusedZoneId) => set({ focusedZoneId }),

  setViewport: (viewport) => set({ viewport }),
  setStageSize: (stageSize) => set({ stageSize }),
}))
