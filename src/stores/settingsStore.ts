import { create } from 'zustand'
import type { MergeConfig, RestaurantSettingsConfig, SeatingConfig } from '@/types'
import { DEFAULT_SEATING_CONFIG } from '@/services/seating/defaultConfig'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config'

/** Persist the chosen locale so language survives reloads. */
const LOCALE_STORAGE_KEY = 'rfm-locale'

const loadLocale = (): Locale => {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCALE
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
  return isLocale(saved) ? saved : DEFAULT_LOCALE
}

/** Default Seating Engine config (store-free module, shared with the server). */
const DEFAULT_SEATING = DEFAULT_SEATING_CONFIG

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
  /**
   * Live Floor time-awareness (Phase 8, Step 6): a table only reads `reserved`
   * once its booking is due within this many minutes (an `arrived` booking
   * always counts). A booking further out stays `available` with an "upcoming"
   * hint instead — so the host isn't shown a table as blocked hours early.
   */
  reservedLookaheadMin: number
  /**
   * Not every restaurant runs a waitlist. Off by default is wrong for most —
   * defaults true — but this flag lets one turn the Live Floor waitlist rail
   * off entirely. No settings UI yet (Phase 10; see per-restaurant rules
   * config); flip it here until then.
   */
  waitlistEnabled: boolean
  /** Active app language. Drives translation + text direction (Phase: i18n). */
  locale: Locale
  /**
   * DB hydration flag (Phase 11). Autosave is gated on this so the pre-hydration
   * defaults never overwrite a restaurant's saved settings (mirrors the layout
   * store). Locale is excluded from persistence — it's per-user, not per-tenant.
   */
  hydrated: boolean
  setHydrated: (hydrated: boolean) => void
  /** Apply a config loaded from the database. Does not touch `locale`. */
  loadConfig: (config: RestaurantSettingsConfig) => void
  setLocale: (locale: Locale) => void
  setGridSize: (size: number) => void
  setSnapToGrid: (snap: boolean) => void
  setPathWidth: (width: number) => void
  setAutoTurnover: (on: boolean) => void
  setStayMinutes: (rule: { default?: number; max?: number }) => void
  setReservedLookaheadMin: (minutes: number) => void
  setWaitlistEnabled: (on: boolean) => void
  /** Patch the merge rule config (one field or many). */
  updateMergeConfig: (patch: Partial<MergeConfig>) => void
  /** Patch top-level seating config fields (e.g. turnover buffer). */
  updateSeatingConfig: (patch: Partial<SeatingConfig>) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  gridSize: 20,
  snapToGrid: true,
  pathWidth: 40,
  seating: DEFAULT_SEATING,
  autoTurnover: true,
  defaultStayMinutes: 120,
  maxStayMinutes: 120,
  reservedLookaheadMin: 60,
  waitlistEnabled: true,
  locale: loadLocale(),
  hydrated: false,
  setHydrated: (hydrated) => set({ hydrated }),
  loadConfig: (config) =>
    set({
      gridSize: config.gridSize,
      snapToGrid: config.snapToGrid,
      pathWidth: config.pathWidth,
      autoTurnover: config.autoTurnover,
      defaultStayMinutes: config.defaultStayMinutes,
      maxStayMinutes: config.maxStayMinutes,
      reservedLookaheadMin: config.reservedLookaheadMin,
      waitlistEnabled: config.waitlistEnabled,
      seating: config.seating,
    }),
  setLocale: (locale) => {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    set({ locale })
  },
  setGridSize: (gridSize) => set({ gridSize }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setPathWidth: (pathWidth) => set({ pathWidth }),
  setAutoTurnover: (autoTurnover) => set({ autoTurnover }),
  setStayMinutes: ({ default: def, max }) =>
    set((s) => ({
      defaultStayMinutes: def ?? s.defaultStayMinutes,
      maxStayMinutes: max ?? s.maxStayMinutes,
    })),
  setReservedLookaheadMin: (reservedLookaheadMin) => set({ reservedLookaheadMin }),
  setWaitlistEnabled: (waitlistEnabled) => set({ waitlistEnabled }),
  updateMergeConfig: (patch) =>
    set((s) => ({ seating: { ...s.seating, merge: { ...s.seating.merge, ...patch } } })),
  updateSeatingConfig: (patch) => set((s) => ({ seating: { ...s.seating, ...patch } })),
}))

/**
 * The DB-persisted slice of the store — everything shared across a restaurant's
 * devices. `locale` and the hydration flag are deliberately excluded. Used by
 * the settings sync hook to decide what to save.
 */
export const persistableConfig = (s: SettingsState): RestaurantSettingsConfig => ({
  gridSize: s.gridSize,
  snapToGrid: s.snapToGrid,
  pathWidth: s.pathWidth,
  autoTurnover: s.autoTurnover,
  defaultStayMinutes: s.defaultStayMinutes,
  maxStayMinutes: s.maxStayMinutes,
  reservedLookaheadMin: s.reservedLookaheadMin,
  waitlistEnabled: s.waitlistEnabled,
  seating: s.seating,
})
