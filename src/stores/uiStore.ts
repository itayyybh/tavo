import { create } from 'zustand'

/** UI Store — transient interface state (selection, panels, active zone). */
interface UIState {
  selectedTableIds: string[]
  activeZoneId: string | null
  setSelection: (ids: string[]) => void
  setActiveZone: (id: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedTableIds: [],
  activeZoneId: null,
  setSelection: (ids) => set({ selectedTableIds: ids }),
  setActiveZone: (id) => set({ activeZoneId: id }),
}))
