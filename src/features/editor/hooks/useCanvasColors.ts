import { useMemo } from 'react'
import { useUIStore } from '@/stores'
import type { TableStatus } from '@/types'

export interface CanvasColors {
  ink: string
  inkSoft: string
  muted: string
  line: string
  surface: string
  surface2: string
  /** Selection accent (Figma-like blue) for canvas selection borders/glows. */
  accent: string
  status: Record<TableStatus, string>
}

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/**
 * Bridge the CSS design tokens onto the Konva canvas (which can't use Tailwind).
 * Recomputed on theme change so canvas colors flip with light/dark.
 */
export function useCanvasColors(): CanvasColors {
  const theme = useUIStore((s) => s.theme)

  return useMemo<CanvasColors>(() => {
    // `theme` is read so the memo recomputes on flip; the values come from the DOM.
    void theme
    return {
      ink: readVar('--color-ink'),
      inkSoft: readVar('--color-ink-soft'),
      muted: readVar('--color-muted'),
      line: readVar('--color-line'),
      surface: readVar('--color-surface'),
      surface2: readVar('--color-surface-2'),
      accent: readVar('--color-accent'),
      status: {
        available: readVar('--color-status-available'),
        reserved: readVar('--color-status-reserved'),
        occupied: readVar('--color-status-occupied'),
        blocked: readVar('--color-status-blocked'),
      },
    }
  }, [theme])
}
