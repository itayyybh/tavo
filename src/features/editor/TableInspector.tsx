import { useLayoutStore, useUIStore } from '@/stores'
import type { Table, TableStatus } from '@/types'
import { cn, groupCapacity, seatsForTable } from '@/utils'
import { TextField } from './fields'

const STATUSES: { id: TableStatus; dot: string }[] = [
  { id: 'available', dot: 'bg-status-available' },
  { id: 'reserved', dot: 'bg-status-reserved' },
  { id: 'occupied', dot: 'bg-status-occupied' },
  { id: 'blocked', dot: 'bg-status-blocked' },
]

/** Segmented status control; `current` is undefined when a group's members differ. */
function StatusPicker({
  current,
  onPick,
}: {
  current: TableStatus | undefined
  onPick: (s: TableStatus) => void
}) {
  return (
    <div className="flex flex-col gap-1 text-[11px] text-muted">
      Status
      <div className="grid grid-cols-2 gap-1">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs capitalize transition-colors',
              current === s.id
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
  )
}

/** Contextual editor for the current selection: a single table, or a merged group. */
export function TableInspector() {
  const selectedIds = useUIStore((s) => s.selectedTableIds)
  const tables = useLayoutStore((s) => s.tables)
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const mergedGroups = useLayoutStore((s) => s.mergedGroups)
  const updateTables = useLayoutStore((s) => s.updateTables)
  const splitGroup = useLayoutStore((s) => s.splitGroup)

  if (selectedIds.length === 0) return null

  // Merged-group view: the whole membership of one group is selected.
  const first = tables.find((t) => t.id === selectedIds[0])
  const group = first?.mergedGroupId
    ? mergedGroups.find((g) => g.id === first.mergedGroupId)
    : undefined
  const isFullGroup =
    group &&
    group.tableIds.length === selectedIds.length &&
    group.tableIds.every((id) => selectedIds.includes(id))

  if (isFullGroup && group) {
    const members = tables.filter((t) => t.mergedGroupId === group.id)
    const seats = groupCapacity(members, tableTypes)
    const uniform = members.every((m) => m.status === members[0].status)
    const status = uniform ? members[0].status : undefined
    const memberIds = members.map((m) => m.id)

    return (
      <div className="space-y-3 border-b border-line bg-surface-2/40 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Merged · {members.length} tables</h3>
          <span className="text-xs text-muted">{seats} seats</span>
        </div>

        <StatusPicker
          current={status}
          onPick={(s) => updateTables(memberIds, { status: s })}
        />

        <p className="text-[11px] text-muted">
          Tables:{' '}
          <span className="text-ink">{members.map((m) => m.label).join(', ')}</span>
        </p>

        <button
          onClick={() => splitGroup(group.id)}
          className="w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink transition-colors hover:bg-surface-2"
        >
          Split
        </button>
      </div>
    )
  }

  if (selectedIds.length !== 1 || !first) return null
  return <SingleTable table={first} />
}

/** Inspector body for a single (non-merged) table. */
function SingleTable({ table }: { table: Table }) {
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const zones = useLayoutStore((s) => s.zones)
  const updateTable = useLayoutStore((s) => s.updateTable)

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

      <StatusPicker
        current={table.status}
        onPick={(s) => updateTable(table.id, { status: s })}
      />

      <p className="text-[11px] text-muted">
        Zone: <span className="text-ink">{zoneName}</span>
      </p>
    </div>
  )
}
