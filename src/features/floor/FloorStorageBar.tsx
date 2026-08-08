import { useMemo, useState } from 'react'
import { useLayoutStore } from '@/stores'
import type { ID, Table } from '@/types'

/**
 * Storage on the Live Floor (Real-service reliability phase).
 *
 * A collapsible bar at the foot of the rail so the host can pull a stored table
 * ONTO the floor mid-shift (a walk-in rush, a reservation that grew) without
 * leaving for the editor. Restored tables reappear at their saved position and
 * immediately count for the Seating Engine again. Hidden when storage is empty —
 * a table gets here via a table's "Move to storage" action (menu / inspector).
 */
export function FloorStorageBar() {
  const tables = useLayoutStore((s) => s.tables)
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const restoreTables = useLayoutStore((s) => s.restoreTables)
  const [open, setOpen] = useState(false)

  const stored = useMemo(() => tables.filter((tbl) => tbl.stored), [tables])

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

  if (stored.length === 0) return null

  return (
    <div className="border-t border-line bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink"
      >
        <span className="flex items-center gap-1.5">
          Storage
          <span className="rounded-full bg-surface-2 px-1.5 text-[10px] tabular-nums text-muted">
            {stored.length}
          </span>
        </span>
        <span className="text-muted">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="max-h-56 space-y-3 overflow-y-auto px-3 pb-3">
          <button
            onClick={() => restoreTables(stored.map((tbl) => tbl.id))}
            className="w-full rounded-lg border border-line px-2 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface-2"
          >
            Place all on floor
          </button>
          {groups.map(({ type, items }) => (
            <div key={type.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-ink">
                  {type.name} × {items.length}
                </span>
                <span className="shrink-0 text-[10px] text-muted">
                  {type.soloCapacity}p each
                </span>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {items.map((tbl) => (
                  <li key={tbl.id}>
                    <button
                      onClick={() => restoreTables([tbl.id])}
                      title="Place on floor"
                      className="group flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink transition-colors hover:border-ink hover:bg-surface-2"
                    >
                      <span className="font-medium">{tbl.label}</span>
                      <span className="text-[10px] text-muted group-hover:text-ink">
                        Place
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
