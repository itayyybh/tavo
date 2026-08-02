import { useMemo } from 'react'
import { useUIStore } from '@/stores'
import type { FloorTableStatus } from '@/types'
import {
  useCanvasColors,
  type CanvasColors,
} from '@/features/editor/hooks/useCanvasColors'

/**
 * Canvas colors for the Live Floor. Reuses the editor's token bridge and widens
 * the status map with the runtime-only `cleaning` state — the editor never needs
 * it, so we extend here instead of touching `useCanvasColors`.
 */
export interface FloorCanvasColors extends Omit<CanvasColors, 'status'> {
  status: Record<FloorTableStatus, string>
}

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function useFloorColors(): FloorCanvasColors {
  const base = useCanvasColors()
  const theme = useUIStore((s) => s.theme)

  return useMemo<FloorCanvasColors>(() => {
    void theme // recompute on theme flip; values come from the DOM
    return {
      ...base,
      status: { ...base.status, cleaning: readVar('--color-status-cleaning') },
    }
  }, [base, theme])
}
