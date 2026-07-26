import { create } from 'zustand'

/**
 * History Store — undo/redo stacks for the layout editor.
 * Generic snapshot stack; the editor pushes serialized layout states.
 */
interface HistoryState<T = unknown> {
  past: T[]
  future: T[]
  push: (snapshot: T) => void
  canUndo: () => boolean
  canRedo: () => boolean
  clear: () => void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  push: (snapshot) => set((state) => ({ past: [...state.past, snapshot], future: [] })),
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  clear: () => set({ past: [], future: [] }),
}))
