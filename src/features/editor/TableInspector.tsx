import { useTranslation } from 'react-i18next'
import { useLayoutStore, useUIStore } from '@/stores'
import type { Table, TableStatus } from '@/types'
import { cn, groupCapacity, seatsForTable } from '@/utils'
import { Field, NumField, TextField } from './fields'

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
  const { t } = useTranslation(['editor', 'common'])
  return (
    <div className="flex flex-col gap-1 text-[11px] text-muted">
      {t('editor:inspector.status')}
      <div className="grid grid-cols-2 gap-1">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
              current === s.id
                ? 'border-ink text-ink'
                : 'border-line text-muted hover:text-ink',
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', s.dot)} />
            {t(`common:tableStatus.${s.id}`)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Contextual editor for the current selection: a single table, or a merged group. */
export function TableInspector() {
  const { t } = useTranslation('editor')
  const selectedIds = useUIStore((s) => s.selectedTableIds)
  const tables = useLayoutStore((s) => s.tables)
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const mergedGroups = useLayoutStore((s) => s.mergedGroups)
  const updateTables = useLayoutStore((s) => s.updateTables)
  const splitGroup = useLayoutStore((s) => s.splitGroup)
  const updateMergedGroup = useLayoutStore((s) => s.updateMergedGroup)

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
    const seats = groupCapacity(members, tableTypes, group)
    const autoSeats = groupCapacity(members, tableTypes)
    const autoClearance = members.reduce(
      (max, m) =>
        Math.max(max, tableTypes.find((ty) => ty.id === m.typeId)?.clearance ?? 0),
      0,
    )
    const uniform = members.every((m) => m.status === members[0].status)
    const status = uniform ? members[0].status : undefined
    const memberIds = members.map((m) => m.id)

    return (
      <div className="space-y-3 border-b border-line bg-surface-2/40 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">
            {t('inspector.mergedTitle', { count: members.length })}
          </h3>
          <span className="text-xs text-muted">
            {t('inspector.seats', { count: seats })}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field
            label={group.seats == null ? t('inspector.seatsAuto') : t('inspector.seats')}
          >
            <NumField
              value={group.seats ?? autoSeats}
              onCommit={(n) => updateMergedGroup(group.id, { seats: n })}
            />
          </Field>
          <Field
            label={
              group.clearance == null
                ? t('inspector.clearanceAuto')
                : t('inspector.clearance')
            }
          >
            <NumField
              value={group.clearance ?? autoClearance}
              onCommit={(n) => updateMergedGroup(group.id, { clearance: n })}
            />
          </Field>
        </div>
        {(group.seats != null || group.clearance != null) && (
          <button
            onClick={() =>
              updateMergedGroup(group.id, { seats: undefined, clearance: undefined })
            }
            className="text-[11px] text-muted transition-colors hover:text-ink"
          >
            {t('inspector.resetAuto')}
          </button>
        )}

        <StatusPicker
          current={status}
          onPick={(s) => updateTables(memberIds, { status: s })}
        />

        <p className="text-[11px] text-muted">
          {t('inspector.tablesLabel')}{' '}
          <span className="text-ink">{members.map((m) => m.label).join(', ')}</span>
        </p>

        <button
          onClick={() => splitGroup(group.id)}
          className="w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink transition-colors hover:bg-surface-2"
        >
          {t('inspector.split')}
        </button>
      </div>
    )
  }

  if (selectedIds.length !== 1 || !first) return null
  return <SingleTable table={first} />
}

/** Inspector body for a single (non-merged) table. */
function SingleTable({ table }: { table: Table }) {
  const { t } = useTranslation('editor')
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const zones = useLayoutStore((s) => s.zones)
  const updateTable = useLayoutStore((s) => s.updateTable)

  const type = tableTypes.find((ty) => ty.id === table.typeId)
  const seats = seatsForTable(table, type)
  const zoneName =
    zones.find((z) => z.id === table.zoneId)?.name ?? t('inspector.unassigned')

  // Switching type re-sizes the table to the new type's default so geometry stays coherent.
  const changeType = (typeId: string) => {
    const next = tableTypes.find((ty) => ty.id === typeId)
    updateTable(table.id, next ? { typeId, size: { ...next.defaultSize } } : { typeId })
  }

  return (
    <div className="space-y-3 border-b border-line bg-surface-2/40 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">
          {t('inspector.tableTitle', { label: table.label })}
        </h3>
        <span className="text-xs text-muted">
          {t('inspector.seats', { count: seats })}
        </span>
      </div>

      <label className="flex flex-col gap-1 text-[11px] text-muted">
        {t('inspector.label')}
        <TextField
          value={table.label}
          onCommit={(label) => updateTable(table.id, { label })}
          className="w-full"
        />
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-muted">
        {t('inspector.type')}
        <select
          value={table.typeId}
          onChange={(e) => changeType(e.target.value)}
          className="rounded border border-line bg-surface px-1.5 py-1 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
        >
          {tableTypes.map((ty) => (
            <option key={ty.id} value={ty.id}>
              {ty.name}
            </option>
          ))}
          {!type && <option value={table.typeId}>{t('inspector.unknown')}</option>}
        </select>
      </label>

      <StatusPicker
        current={table.status}
        onPick={(s) => updateTable(table.id, { status: s })}
      />

      <p className="text-[11px] text-muted">
        {t('inspector.zoneLabel')} <span className="text-ink">{zoneName}</span>
      </p>
    </div>
  )
}
