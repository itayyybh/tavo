import { useEffect, useRef } from 'react'

/**
 * Handlers the reservation page wires to keyboard shortcuts. Kept as a flat
 * config so the set is easy to extend without touching the listener logic.
 */
export interface ShortcutHandlers {
  onNew: () => void
  onFocusSearch: () => void
  onEscape: () => void
  /** dir: +1 = down/next, -1 = up/previous. */
  onNavigate: (dir: 1 | -1) => void
  onOpenSelected: () => void
  onEditSelected: () => void
  onDeleteSelected: () => void
  onOpenPalette: () => void
  onOpenHelp: () => void
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/**
 * Global keyboard shortcuts for the Reservations page.
 *
 * - `active` is false while a modal is open, so shortcuts never fight dialogs
 *   (each Dialog owns its own Escape-to-close).
 * - While focus is inside an input/textarea/select, only Escape and the
 *   Cmd/Ctrl combos fire — printable keys type normally.
 * - One window listener; latest handlers are read via a ref so it never rebinds.
 */
export function useReservationShortcuts(handlers: ShortcutHandlers, active: boolean) {
  const ref = useRef(handlers)
  // Keep the latest handlers without rebinding the listener.
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active) return
      const h = ref.current
      const meta = e.metaKey || e.ctrlKey

      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        h.onOpenPalette()
        return
      }
      if (meta && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        h.onFocusSearch()
        return
      }
      // Other modifier combos are the browser's / OS's — don't intercept.
      if (meta || e.altKey) return

      if (e.key === 'Escape') {
        h.onEscape()
        return
      }

      if (isTypingTarget(e.target)) return

      switch (e.key) {
        case 'n':
        case 'N':
          e.preventDefault()
          h.onNew()
          break
        case '/':
          e.preventDefault()
          h.onFocusSearch()
          break
        case '?':
          e.preventDefault()
          h.onOpenHelp()
          break
        case 'ArrowDown':
          e.preventDefault()
          h.onNavigate(1)
          break
        case 'ArrowUp':
          e.preventDefault()
          h.onNavigate(-1)
          break
        case 'Enter':
          e.preventDefault()
          h.onOpenSelected()
          break
        case 'e':
        case 'E':
          e.preventDefault()
          h.onEditSelected()
          break
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          h.onDeleteSelected()
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}
