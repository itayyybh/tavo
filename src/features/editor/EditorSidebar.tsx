import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils'
import { useLayoutStore } from '@/stores'
import { ZonesPanel } from './ZonesPanel'
import { TableTypesPanel } from './TableTypesPanel'
import { TableInspector } from './TableInspector'
import { StoragePanel } from './StoragePanel'

type Tab = 'zones' | 'types' | 'storage'
const TABS: { id: Tab; labelKey: string }[] = [
  { id: 'zones', labelKey: 'sidebar.zones' },
  { id: 'types', labelKey: 'sidebar.types' },
  { id: 'storage', labelKey: 'sidebar.storage' },
]

interface EditorSidebarProps {
  /** Dismiss the mobile drawer after an action (forwarded to the zones panel). */
  onClosePanel?: () => void
}

/** Right rail with tabbed Zones / Table Types management. */
export function EditorSidebar({ onClosePanel }: EditorSidebarProps) {
  const { t } = useTranslation('editor')
  const [tab, setTab] = useState<Tab>('zones')
  const storedCount = useLayoutStore((s) => s.tables.filter((tbl) => tbl.stored).length)

  return (
    <aside className="flex h-full w-64 flex-col border-e border-line bg-surface">
      <TableInspector />
      <div className="flex border-b border-line">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              '-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors',
              tab === item.id
                ? 'border-ink text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t(item.labelKey)}
            {item.id === 'storage' && storedCount > 0 && (
              <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-semibold tabular-nums text-muted">
                {storedCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'zones' ? (
        <ZonesPanel onClosePanel={onClosePanel} />
      ) : tab === 'types' ? (
        <TableTypesPanel />
      ) : (
        <StoragePanel />
      )}
    </aside>
  )
}
