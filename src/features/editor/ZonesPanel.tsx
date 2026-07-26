import { Button } from '@/components/ui'
import { useLayoutStore, useUIStore } from '@/stores'
import { cn } from '@/utils'

/** Sidebar for managing zones and assigning selected tables to them. */
export function ZonesPanel() {
  const zones = useLayoutStore((s) => s.zones)
  const tables = useLayoutStore((s) => s.tables)
  const removeZone = useLayoutStore((s) => s.removeZone)
  const setTablesZone = useLayoutStore((s) => s.setTablesZone)

  const selectedZoneId = useUIStore((s) => s.selectedZoneId)
  const selectZone = useUIStore((s) => s.selectZone)
  const selectedTableIds = useUIStore((s) => s.selectedTableIds)

  const countFor = (zoneId: string) => tables.filter((t) => t.zoneId === zoneId).length
  const unassigned = tables.filter((t) => !t.zoneId).length
  const selectedCount = selectedTableIds.length

  return (
    <aside className="flex w-64 flex-col border-l border-line bg-surface">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Zones</h2>
      </header>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
        {zones.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted">
            No zones yet — add one from the toolbar.
          </p>
        )}
        {zones.map((zone) => (
          <div
            key={zone.id}
            onClick={() => selectZone(zone.id)}
            className={cn(
              'group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
              selectedZoneId === zone.id ? 'bg-surface-2' : 'hover:bg-surface-2',
            )}
          >
            <span className="truncate text-ink">{zone.name}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums text-xs text-muted">{countFor(zone.id)}</span>
              <button
                aria-label={`Delete ${zone.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  removeZone(zone.id)
                }}
                className="text-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
              >
                ✕
              </button>
            </span>
          </div>
        ))}
        <p className="px-3 pt-2 text-xs text-muted">Unassigned: {unassigned}</p>
      </div>

      {selectedCount > 0 && (
        <div className="space-y-2 border-t border-line p-3">
          <p className="text-xs font-medium text-ink">
            Assign {selectedCount} table{selectedCount > 1 ? 's' : ''} to
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setTablesZone(selectedTableIds, null)}
            >
              Auto
            </Button>
            {zones.map((zone) => (
              <Button
                key={zone.id}
                size="sm"
                variant="secondary"
                onClick={() => setTablesZone(selectedTableIds, zone.id)}
              >
                {zone.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
