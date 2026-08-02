import { create } from 'zustand'
import type { MergeConfig, SeatingConfig } from '@/types'

/** Default Seating Engine config — everything empty/permissive; host tunes per restaurant. */
const DEFAULT_SEATING: SeatingConfig = {
  merge: {
    forbiddenCombos: [],
    maxMergeSize: 5,
    allowCrossZoneMerge: false,
    proximityWeight: 1,
  },
  turnoverBufferMin: 15,
  maxUnderfill: 2,
  weights: {
    capacityFit: 10,
    zoneMatch: 6,
    preferredTable: 8,
    singleTable: 3,
  },
}

/** Settings Store — restaurant-level configuration (grid size, snap, seating rules). */
interface SettingsState {
  gridSize: number
  snapToGrid: boolean
  /** Brush width (world units) for freehand keep-clear paths. */
  pathWidth: number
  /** Seating Engine configuration (Phase 7). */
  seating: SeatingConfig
  /**
   * Live Floor turnover (Phase 8): when true, a cleaning table returns to
   * available on its own once `seating.turnoverBufferMin` elapses. Manual
   * finish-cleaning always works regardless.
   */
  autoTurnover: boolean
  /**
   * Restaurant rules (Phase 8; per-restaurant in Phase 10). Table stay time in
   * minutes: the default a new booking gets, and the hard maximum.
   */
  defaultStayMinutes: number
  maxStayMinutes: number
  setGridSize: (size: number) => void
  setSnapToGrid: (snap: boolean) => void
  setPathWidth: (width: number) => void
  setAutoTurnover: (on: boolean) => void
  setStayMinutes: (rule: { default?: number; max?: number }) => void
  /** Patch the merge rule config (one field or many). */
  updateMergeConfig: (patch: Partial<MergeConfig>) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  gridSize: 20,
  snapToGrid: true,
  pathWidth: 40,
  seating: DEFAULT_SEATING,
  autoTurnover: true,
  defaultStayMinutes: 120,
  maxStayMinutes: 120,
  setGridSize: (gridSize) => set({ gridSize }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setPathWidth: (pathWidth) => set({ pathWidth }),
  setAutoTurnover: (autoTurnover) => set({ autoTurnover }),
  setStayMinutes: ({ default: def, max }) =>
    set((s) => ({
      defaultStayMinutes: def ?? s.defaultStayMinutes,
      maxStayMinutes: max ?? s.maxStayMinutes,
    })),
  updateMergeConfig: (patch) =>
    set((s) => ({ seating: { ...s.seating, merge: { ...s.seating.merge, ...patch } } })),
}))
