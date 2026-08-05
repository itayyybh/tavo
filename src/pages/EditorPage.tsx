import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  EditorCanvas,
  EditorSidebar,
  FloorSummary,
  Toolbar,
  useAutosave,
  useEditorShortcuts,
} from '@/features/editor'
import { useLayoutStore } from '@/stores'
import { loadLayout } from '@/services/layoutStorage'
import { cn, createId } from '@/utils'
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
  const { t } = useTranslation('editor')
  useEditorShortcuts()
  useAutosave()
  const [panelOpen, setPanelOpen] = useState(false)

  // App hydrates a saved layout globally; seed a demo only when there's nothing
  // saved and the store is still empty (first-ever visit).
  useEffect(() => {
    if (loadLayout()) return
    if (useLayoutStore.getState().tables.length === 0) seedDemo()
  }, [])

  return (
    <div className="flex h-full flex-col bg-surface">
      <Toolbar onToggleZones={() => setPanelOpen((o) => !o)} />
      <div className="relative flex min-h-0 flex-1">
        {/* Zones: a static rail on desktop, a slide-over drawer on small screens. */}
        {panelOpen && (
          <div
            className="absolute inset-0 z-20 bg-ink/10 md:hidden"
            onClick={() => setPanelOpen(false)}
          />
        )}
        <div
          className={cn(
            'absolute inset-y-0 start-0 z-30 flex shadow-[var(--shadow-soft)] transition-transform md:static md:z-auto md:translate-x-0 md:shadow-none',
            panelOpen
              ? 'translate-x-0'
              : '-translate-x-full rtl:translate-x-full md:translate-x-0',
          )}
        >
          <EditorSidebar onClosePanel={() => setPanelOpen(false)} />
        </div>
        <div className="min-h-0 flex-1">
          <EditorCanvas />
        </div>
      </div>
      <footer className="flex items-center justify-between gap-4 border-t border-line px-4 py-1.5 text-xs text-muted">
        <span className="min-w-0 truncate">{t('footerHint')}</span>
        <FloorSummary />
      </footer>
    </div>
  )
}
