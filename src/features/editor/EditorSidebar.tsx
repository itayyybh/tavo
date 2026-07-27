import { useState } from 'react'
import { cn } from '@/utils'
import { ZonesPanel } from './ZonesPanel'
import { TableTypesPanel } from './TableTypesPanel'
import { TableInspector } from './TableInspector'

type Tab = 'zones' | 'types'
const TABS: { id: Tab; label: string }[] = [
  { id: 'zones', label: 'Zones' },
  { id: 'types', label: 'Types' },
]

interface EditorSidebarProps {
  /** Dismiss the mobile drawer after an action (forwarded to the zones panel). */
  onClosePanel?: () => void
}

/** Right rail with tabbed Zones / Table Types management. */
export function EditorSidebar({ onClosePanel }: EditorSidebarProps) {
  const [tab, setTab] = useState<Tab>('zones')

  return (
    <aside className="flex h-full w-64 flex-col border-l border-line bg-surface">
      <TableInspector />
      <div className="flex border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px flex-1 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-ink text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'zones' ? <ZonesPanel onClosePanel={onClosePanel} /> : <TableTypesPanel />}
    </aside>
  )
}
