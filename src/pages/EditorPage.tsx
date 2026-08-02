import { useState } from 'react'
import {
  EditorCanvas,
  EditorSidebar,
  FloorSetupPrompt,
  FloorSummary,
  Toolbar,
  useEditorShortcuts,
} from '@/features/editor'
import { useLayoutStore } from '@/stores'
import { cn } from '@/utils'

/** Layout Editor — the Figma-like restaurant builder (see the `layout-editor` skill). */
export default function EditorPage() {
  useEditorShortcuts()
  const [panelOpen, setPanelOpen] = useState(false)
  const [setupDismissed, setSetupDismissed] = useState(false)

  // A hydrated-but-empty floor means a fresh restaurant — show the setup prompt
  // (the DB-backed layout sync lives in App; no demo seeding here anymore).
  const hydrated = useLayoutStore((s) => s.hydrated)
  const isEmpty = useLayoutStore(
    (s) => s.tables.length === 0 && s.zones.length === 0,
  )
  const showSetup = hydrated && isEmpty && !setupDismissed

  return (
    <div className="flex h-full flex-col bg-surface">
      <Toolbar onToggleZones={() => setPanelOpen((o) => !o)} />
      <div className="relative flex min-h-0 flex-1">
        {showSetup && (
          <FloorSetupPrompt onCreate={() => setSetupDismissed(true)} />
        )}
        {/* Zones: a static rail on desktop, a slide-over drawer on small screens. */}
        {panelOpen && (
          <div
            className="absolute inset-0 z-20 bg-ink/10 md:hidden"
            onClick={() => setPanelOpen(false)}
          />
        )}
        <div
          className={cn(
            'absolute inset-y-0 left-0 z-30 flex shadow-[var(--shadow-soft)] transition-transform md:static md:z-auto md:translate-x-0 md:shadow-none',
            panelOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          )}
        >
          <EditorSidebar onClosePanel={() => setPanelOpen(false)} />
        </div>
        <div className="min-h-0 flex-1">
          <EditorCanvas />
        </div>
      </div>
      <footer className="flex items-center justify-between gap-4 border-t border-line px-4 py-1.5 text-xs text-muted">
        <span className="min-w-0 truncate">
          Space + drag to pan · ctrl/pinch to zoom · drag to marquee-select · double-click
          a table to rename · ⌫ delete · ⌘Z undo
        </span>
        <FloorSummary />
      </footer>
    </div>
  )
}
