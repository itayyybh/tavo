import { create } from 'zustand'
import type { MergedGroup, Table, Zone } from '@/types'

/** Layout Store — tables, zones, and merge groups that make up a restaurant floor. */
interface LayoutState {
  zones: Zone[]
  tables: Table[]
  mergedGroups: MergedGroup[]
  setTables: (tables: Table[]) => void
  setZones: (zones: Zone[]) => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  zones: [],
  tables: [],
  mergedGroups: [],
  setTables: (tables) => set({ tables }),
  setZones: (zones) => set({ zones }),
}))
