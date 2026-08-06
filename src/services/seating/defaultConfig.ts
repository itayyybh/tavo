import type { SeatingConfig } from '@/types'

/**
 * Default Seating Engine config. Mostly permissive; the host tunes it per
 * restaurant. The merge rules below are SEED example rules for the current
 * layout (zone "Inside", tables 7/10/11/12), authored by label — they move to
 * the Phase 10 rules UI. Harmless if the labels/zone don't exist in a layout
 * (they simply never match).
 *
 * Extracted from the settings store into a plain (store-free) module so the
 * server-side availability bundle can reuse it without pulling in Zustand.
 */
export const DEFAULT_SEATING_CONFIG: SeatingConfig = {
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
    lastResortGatherZone: true,
  },
  turnoverBufferMin: 15,
  maxUnderfill: 2,
  weights: {
    capacityFit: 10,
    zoneMatch: 6,
    preferredTable: 8,
    singleTable: 3,
    preferredCombo: 12,
  },
}
