import { create } from 'zustand'
import type { MergeConfig, SeatingConfig } from '@/types'

/**
 * Default Seating Engine config. Mostly permissive; the host tunes it per
 * restaurant. The merge rules below are SEED example rules for the current
 * layout (zone "Inside", tables 7/10/11/12), authored by label — they move to
 * the Phase 10 rules UI. Harmless if the labels/zone don't exist in a layout
 * (they simply never match).
 */
const DEFAULT_SEATING: SeatingConfig = {
  merge: {
    forbiddenCombos: [],
    // 11 + 12 may not merge on their own (only inside a bigger combo like
    // 7+10+11+12, which is a different set and stays allowed).
    forbiddenLabelCombos: [['11', '12']],
    maxMergeSize: 5,
    allowCrossZoneMerge: false,
    proximityWeight: 1,
    // Inside, a party of 13+ may only take the 7+10+11+12 combo.
    largePartyRules: [
      { zoneName: 'Inside', minPartySize: 13, allowedCombos: [['7', '10', '11', '12']] },
    ],
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
  setGridSize: (size: number) => void
  setSnapToGrid: (snap: boolean) => void
  setPathWidth: (width: number) => void
  setAutoTurnover: (on: boolean) => void
  setStayMinutes: (rule: { default?: number; max?: number }) => void
  setReservedLookaheadMin: (minutes: number) => void
  setWaitlistEnabled: (on: boolean) => void
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
  reservedLookaheadMin: 60,
  waitlistEnabled: true,
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
}))
