import { create } from 'zustand'
import type { MergeConfig, SeatingConfig } from '@/types'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config'

/** Persist the chosen locale so language survives reloads. */
const LOCALE_STORAGE_KEY = 'rfm-locale'

const loadLocale = (): Locale => {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCALE
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
  return isLocale(saved) ? saved : DEFAULT_LOCALE
}

/** Default Seating Engine config — everything empty/permissive; host tunes per restaurant. */
const DEFAULT_SEATING: SeatingConfig = {
  merge: {
    forbiddenCombos: [],
    maxMergeSize: 5,
    allowCrossZoneMerge: false,
    proximityWeight: 1,
  },
  turnoverBufferMin: 15,
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
  /** Active app language. Drives translation + text direction (Phase: i18n). */
  locale: Locale
  setLocale: (locale: Locale) => void
  setGridSize: (size: number) => void
  setSnapToGrid: (snap: boolean) => void
  setPathWidth: (width: number) => void
  /** Patch the merge rule config (one field or many). */
  updateMergeConfig: (patch: Partial<MergeConfig>) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  gridSize: 20,
  snapToGrid: true,
  pathWidth: 40,
  seating: DEFAULT_SEATING,
  locale: loadLocale(),
  setLocale: (locale) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    set({ locale })
  },
  setGridSize: (gridSize) => set({ gridSize }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setPathWidth: (pathWidth) => set({ pathWidth }),
  updateMergeConfig: (patch) =>
    set((s) => ({ seating: { ...s.seating, merge: { ...s.seating.merge, ...patch } } })),
}))
