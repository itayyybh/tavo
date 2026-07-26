import { create } from 'zustand'

export type Theme = 'light' | 'dark'

/** UI Store — transient interface state (selection, panels, active zone, theme). */
interface UIState {
  selectedTableIds: string[]
  activeZoneId: string | null
  theme: Theme
  setSelection: (ids: string[]) => void
  setActiveZone: (id: string | null) => void
  toggleTheme: () => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedTableIds: [],
  activeZoneId: null,
  theme: 'light',
  setSelection: (ids) => set({ selectedTableIds: ids }),
  setActiveZone: (id) => set({ activeZoneId: id }),
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
}))
