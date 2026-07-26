import { useEffect } from 'react'
import {
  EditorCanvas,
  Toolbar,
  ZonesPanel,
  useAutosave,
  useEditorShortcuts,
} from '@/features/editor'
import { useLayoutStore } from '@/stores'
import { loadLayout } from '@/services/layoutStorage'
import { createId } from '@/utils'
import type { Obstacle, Table } from '@/types'

/** Build a small demo floor so a first-time canvas isn't empty. */
function seedDemo() {
  const { tableTypes, zones, loadSnapshot } = useLayoutStore.getState()
  const zoneId = zones[0]?.id ?? 'zone-inside'
  const at = (typeId: string, x: number, y: number, label: string): Table | null => {
    const type = tableTypes.find((t) => t.id === typeId)
    if (!type) return null
    return {
      id: createId(),
      zoneId,
      typeId,
      label,
      position: { x, y },
      size: { ...type.defaultSize },
      rotation: 0,
      status: 'available',
    }
  }
  const tables = [
    at('type-square', 160, 160, '12'),
    at('type-round', 340, 160, '43'),
    at('type-rect', 220, 340, '132'),
  ].filter((t): t is Table => t !== null)

  const obstacles: Obstacle[] = [
    {
      id: createId(),
      kind: 'wall',
      position: { x: 480, y: 260 },
      size: { x: 20, y: 220 },
      rotation: 0,
    },
  ]

  loadSnapshot({ tables, zones, mergedGroups: [], obstacles })
}

/** Layout Editor — the Figma-like restaurant builder (see the `layout-editor` skill). */
export default function EditorPage() {
  useEditorShortcuts()
  useAutosave()

  // Load a saved layout, or seed a demo the first time.
  useEffect(() => {
    const saved = loadLayout()
    if (saved) useLayoutStore.getState().loadSnapshot(saved)
    else seedDemo()
  }, [])

  return (
    <div className="flex h-full flex-col bg-surface">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1">
          <EditorCanvas />
        </div>
        <ZonesPanel />
      </div>
      <footer className="border-t border-line px-4 py-1.5 text-xs text-muted">
        Space + drag to pan · ctrl/pinch to zoom · drag to marquee-select · double-click a
        table to rename · ⌫ delete · ⌘Z undo
      </footer>
    </div>
  )
}
