import { create } from 'zustand'
import { createId } from '@/utils'

/**
 * Toast Store — transient, self-dismissing status messages.
 *
 * A tiny app-wide notification queue, kept separate from feature stores (see the
 * `state-managment` skill). `notify` enqueues a message and schedules its
 * removal; the `Toaster` renders the live queue. Store-free of i18n — callers
 * pass an already-translated string.
 */
export interface Toast {
  id: string
  message: string
}

/** How long a toast stays before auto-dismissing (ms). */
const TOAST_TTL = 3500

interface ToastState {
  toasts: Toast[]
  /** Show a transient message; auto-dismisses after a few seconds. */
  notify: (message: string) => void
  /** Remove a toast now (e.g. on click). */
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  notify: (message) => {
    const id = createId()
    set((s) => ({ toasts: [...s.toasts, { id, message }] }))
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      TOAST_TTL,
    )
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
