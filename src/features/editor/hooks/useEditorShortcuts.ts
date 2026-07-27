import { useEffect } from 'react'
import { useLayoutStore, useSettingsStore, useUIStore } from '@/stores'
import type { LayoutClipboard } from '@/types'

/** True when focus is in a form field — shortcuts should stay out of the way. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

// Editor clipboard (module-scoped; survives re-renders, not persisted).
let clipboard: LayoutClipboard = { tables: [], obstacles: [], zones: [] }
const clipboardEmpty = (c: LayoutClipboard) =>
  !c.tables.length && !c.obstacles.length && !c.zones.length

/** Snapshot the current selection into a clipboard shape. */
function selectionToClipboard(): LayoutClipboard {
  const { selectedTableIds, selectedObstacleId, selectedZoneId } = useUIStore.getState()
  const { tables, obstacles, zones } = useLayoutStore.getState()
  return {
    tables: tables.filter((t) => selectedTableIds.includes(t.id)),
    obstacles: selectedObstacleId
      ? obstacles.filter((o) => o.id === selectedObstacleId)
      : [],
    zones: selectedZoneId ? zones.filter((z) => z.id === selectedZoneId) : [],
  }
}

/** Paste a clipboard offset by one grid step and select the new items. */
function pasteClipboard(clip: LayoutClipboard) {
  if (clipboardEmpty(clip)) return
  const step = useSettingsStore.getState().gridSize
  const { paste } = useLayoutStore.getState()
  const { setSelection, selectObstacle, selectZone } = useUIStore.getState()
  const { tableIds, obstacleIds, zoneIds } = paste(clip, { x: step, y: step })
  if (tableIds.length) setSelection(tableIds)
  else if (obstacleIds.length) selectObstacle(obstacleIds[0])
  else if (zoneIds.length) selectZone(zoneIds[0])
}

/** Global editor keyboard shortcuts. Mount once (in EditorPage). */
export function useEditorShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return

      const {
        selectedTableIds,
        selectedObstacleId,
        selectedZoneId,
        focusedZoneId,
        tool,
        clearSelection,
        setFocusedZone,
        setTool,
      } = useUIStore.getState()
      const { removeTables, removeObstacle, removeZone, undo, redo, moveTablesBy } =
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

      // Copy / paste / duplicate the current selection
      if (mod && e.key.toLowerCase() === 'c') {
        const clip = selectionToClipboard()
        if (!clipboardEmpty(clip)) {
          e.preventDefault()
          clipboard = clip
        }
        return
      }
      if (mod && e.key.toLowerCase() === 'v') {
        if (!clipboardEmpty(clipboard)) {
          e.preventDefault()
          pasteClipboard(clipboard)
        }
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        const clip = selectionToClipboard()
        if (!clipboardEmpty(clip)) {
          e.preventDefault()
          pasteClipboard(clip)
        }
        return
      }

      // Delete selection (obstacle / zone take priority when one is selected)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObstacleId) {
          e.preventDefault()
          removeObstacle(selectedObstacleId)
          clearSelection()
          return
        }
        if (selectedZoneId) {
          e.preventDefault()
          removeZone(selectedZoneId)
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

      // Escape: leave the path tool, then zone-focus, then just deselect.
      if (e.key === 'Escape') {
        if (tool !== 'select') setTool('select')
        else if (focusedZoneId) setFocusedZone(null)
        else clearSelection()
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
