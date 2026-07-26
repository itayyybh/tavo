import { useEffect } from 'react'
import { useLayoutStore, useSettingsStore, useUIStore } from '@/stores'

/** True when focus is in a form field — shortcuts should stay out of the way. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

/** Global editor keyboard shortcuts. Mount once (in EditorPage). */
export function useEditorShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return

      const { selectedTableIds, selectedObstacleId, clearSelection } =
        useUIStore.getState()
      const { removeTables, removeObstacle, undo, redo, moveTablesBy } =
        useLayoutStore.getState()
      const mod = e.metaKey || e.ctrlKey

      // Undo / redo
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }

      // Delete selection (obstacle takes priority when one is selected)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObstacleId) {
          e.preventDefault()
          removeObstacle(selectedObstacleId)
          clearSelection()
          return
        }
        if (selectedTableIds.length) {
          e.preventDefault()
          removeTables(selectedTableIds)
          clearSelection()
          return
        }
      }

      // Deselect
      if (e.key === 'Escape') {
        clearSelection()
        return
      }

      // Nudge with arrows (one grid step)
      const step = useSettingsStore.getState().gridSize
      const nudge: Record<string, { x: number; y: number }> = {
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
      }
      if (nudge[e.key] && selectedTableIds.length) {
        e.preventDefault()
        moveTablesBy(selectedTableIds, nudge[e.key])
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
