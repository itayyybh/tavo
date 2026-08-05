import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils'
import { ZonesPanel } from './ZonesPanel'
import { TableTypesPanel } from './TableTypesPanel'
import { TableInspector } from './TableInspector'

type Tab = 'zones' | 'types'
const TABS: { id: Tab; labelKey: string }[] = [
  { id: 'zones', labelKey: 'sidebar.zones' },
  { id: 'types', labelKey: 'sidebar.types' },
]

interface EditorSidebarProps {
  /** Dismiss the mobile drawer after an action (forwarded to the zones panel). */
  onClosePanel?: () => void
}

/** Right rail with tabbed Zones / Table Types management. */
export function EditorSidebar({ onClosePanel }: EditorSidebarProps) {
  const { t } = useTranslation('editor')
  const [tab, setTab] = useState<Tab>('zones')

  return (
    <aside className="flex h-full w-64 flex-col border-e border-line bg-surface">
      <TableInspector />
      <div className="flex border-b border-line">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              '-mb-px flex-1 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              tab === item.id
                ? 'border-ink text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {tab === 'zones' ? <ZonesPanel onClosePanel={onClosePanel} /> : <TableTypesPanel />}
    </aside>
  )
}
