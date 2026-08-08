import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLayoutStore } from '@/stores'
import type { ID, Table } from '@/types'

/**
 * Table Storage / Inventory (Real-service reliability phase).
 *
 * Lists the tables the restaurant owns but has taken OFF the active floor — kept
 * with all their config so they restore exactly, never deleted. Grouped by type
 * (e.g. "Small Square × 6"), each table restorable individually or all at once.
 * Stored tables are excluded from the Live Floor, the Seating Engine, and zone
 * capacity (see `useSeatingFloor`); this panel is the only place they surface.
 */
export function StoragePanel() {
  const { t } = useTranslation('editor')
  const tables = useLayoutStore((s) => s.tables)
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const restoreTables = useLayoutStore((s) => s.restoreTables)

  const stored = useMemo(() => tables.filter((tbl) => tbl.stored), [tables])

  // Group the stored tables by their type, preserving type order.
  const groups = useMemo(() => {
    const byType = new Map<ID, Table[]>()
    for (const tbl of stored) {
      const list = byType.get(tbl.typeId) ?? []
      list.push(tbl)
      byType.set(tbl.typeId, list)
    }
    return tableTypes
      .map((type) => ({ type, items: byType.get(type.id) ?? [] }))
      .filter((g) => g.items.length > 0)
  }, [stored, tableTypes])

  if (stored.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs leading-relaxed text-muted">{t('storage.empty')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-medium text-muted">
          {t('storage.count', { count: stored.length })}
        </span>
        <button
          onClick={() => restoreTables(stored.map((tbl) => tbl.id))}
          className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface-2"
        >
          {t('storage.restoreAll')}
        </button>
      </div>

      <div className="space-y-4 p-3">
        {groups.map(({ type, items }) => (
          <div key={type.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                {t('storage.typeCount', { name: type.name, count: items.length })}
              </span>
              <span className="shrink-0 text-[11px] text-muted">
                {t('storage.seatsEach', { count: type.soloCapacity })}
              </span>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {items.map((tbl) => (
                <li key={tbl.id}>
                  <button
                    onClick={() => restoreTables([tbl.id])}
                    title={t('storage.restore')}
                    className="group flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink transition-colors hover:border-ink hover:bg-surface-2"
                  >
                    <span className="font-medium">{tbl.label}</span>
                    <span className="text-[10px] text-muted group-hover:text-ink">
                      {t('storage.restore')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
