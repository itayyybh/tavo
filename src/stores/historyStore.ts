import { create } from 'zustand'
import type { LayoutSnapshot } from '@/types'

/**
 * History Store — undo/redo stacks of layout snapshots.
 * The layout store owns the live document and composes this store:
 * it records a snapshot before each committed mutation, and calls
 * undo/redo passing the current document as the pivot.
 */
interface HistoryState {
  past: LayoutSnapshot[]
  future: LayoutSnapshot[]
  /** Push the pre-mutation snapshot; clears the redo stack. */
  record: (present: LayoutSnapshot) => void
  /** Returns the snapshot to restore (moving `present` onto the redo stack), or null. */
  undo: (present: LayoutSnapshot) => LayoutSnapshot | null
  /** Returns the snapshot to restore (moving `present` onto the undo stack), or null. */
  redo: (present: LayoutSnapshot) => LayoutSnapshot | null
  reset: () => void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  record: (present) => set((s) => ({ past: [...s.past, present], future: [] })),
  undo: (present) => {
    const { past, future } = get()
    if (past.length === 0) return null
    const previous = past[past.length - 1]
    set({ past: past.slice(0, -1), future: [...future, present] })
    return previous
  },
  redo: (present) => {
    const { past, future } = get()
    if (future.length === 0) return null
    const next = future[future.length - 1]
    set({ past: [...past, present], future: future.slice(0, -1) })
    return next
  },
  reset: () => set({ past: [], future: [] }),
}))
