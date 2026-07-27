import { useLayoutStore, useUIStore } from '@/stores'
import type { TableStatus } from '@/types'
import { cn, seatsForTable } from '@/utils'
import { TextField } from './fields'

const STATUSES: { id: TableStatus; dot: string }[] = [
  { id: 'available', dot: 'bg-status-available' },
  { id: 'reserved', dot: 'bg-status-reserved' },
  { id: 'occupied', dot: 'bg-status-occupied' },
  { id: 'blocked', dot: 'bg-status-blocked' },
]

/** Contextual editor for the single selected table (label, type, status). */
export function TableInspector() {
  const selectedIds = useUIStore((s) => s.selectedTableIds)
  const tables = useLayoutStore((s) => s.tables)
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const zones = useLayoutStore((s) => s.zones)
  const updateTable = useLayoutStore((s) => s.updateTable)

  if (selectedIds.length !== 1) return null
  const table = tables.find((t) => t.id === selectedIds[0])
  if (!table) return null

  const type = tableTypes.find((t) => t.id === table.typeId)
  const seats = seatsForTable(table, type)
  const zoneName = zones.find((z) => z.id === table.zoneId)?.name ?? 'Unassigned'

  // Switching type re-sizes the table to the new type's default so geometry stays coherent.
  const changeType = (typeId: string) => {
    const next = tableTypes.find((t) => t.id === typeId)
    updateTable(table.id, next ? { typeId, size: { ...next.defaultSize } } : { typeId })
  }

  return (
    <div className="space-y-3 border-b border-line bg-surface-2/40 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Table {table.label}</h3>
        <span className="text-xs text-muted">
          {seats} {seats === 1 ? 'seat' : 'seats'}
        </span>
      </div>

      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Label
        <TextField
          value={table.label}
          onCommit={(label) => updateTable(table.id, { label })}
          className="w-full"
        />
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Type
        <select
          value={table.typeId}
          onChange={(e) => changeType(e.target.value)}
          className="rounded border border-line bg-surface px-1.5 py-1 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
        >
          {tableTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          {!type && <option value={table.typeId}>Unknown</option>}
        </select>
      </label>

      <div className="flex flex-col gap-1 text-[11px] text-muted">
        Status
        <div className="grid grid-cols-2 gap-1">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              onClick={() => updateTable(table.id, { status: s.id })}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs capitalize transition-colors',
                table.status === s.id
                  ? 'border-ink text-ink'
                  : 'border-line text-muted hover:text-ink',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', s.dot)} />
              {s.id}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted">
        Zone: <span className="text-ink">{zoneName}</span>
      </p>
    </div>
  )
}
