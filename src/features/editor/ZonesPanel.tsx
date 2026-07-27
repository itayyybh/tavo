import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { useLayoutStore, useSettingsStore, useUIStore } from '@/stores'
import type { Zone } from '@/types'
import { clamp, cn, screenToWorld, snapPoint } from '@/utils'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
// Padding around a focused zone, in grid squares, on each side.
const FOCUS_PADDING_SQUARES = 5

interface ZonesPanelProps {
  /** Called after an action that should dismiss the mobile drawer (e.g. focus). */
  onClosePanel?: () => void
}

/** Sidebar for managing zones and assigning selected tables to them. */
export function ZonesPanel({ onClosePanel }: ZonesPanelProps) {
  const zones = useLayoutStore((s) => s.zones)
  const tables = useLayoutStore((s) => s.tables)
  const addZone = useLayoutStore((s) => s.addZone)
  const updateZone = useLayoutStore((s) => s.updateZone)
  const removeZone = useLayoutStore((s) => s.removeZone)
  const setTablesZone = useLayoutStore((s) => s.setTablesZone)

  const selectedZoneId = useUIStore((s) => s.selectedZoneId)
  const selectZone = useUIStore((s) => s.selectZone)
  const selectedTableIds = useUIStore((s) => s.selectedTableIds)
  const viewport = useUIStore((s) => s.viewport)
  const stageSize = useUIStore((s) => s.stageSize)
  const focusedZoneId = useUIStore((s) => s.focusedZoneId)
  const setFocusedZone = useUIStore((s) => s.setFocusedZone)
  const setViewport = useUIStore((s) => s.setViewport)

  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId) inputRef.current?.select()
  }, [renamingId])

  const countFor = (zoneId: string) => tables.filter((t) => t.zoneId === zoneId).length
  const unassigned = tables.filter((t) => !t.zoneId).length
  const selectedCount = selectedTableIds.length

  const startRename = (id: string, name: string) => {
    setRenamingId(id)
    setDraft(name)
  }
  const commitRename = () => {
    if (renamingId) {
      const name = draft.trim()
      if (name) updateZone(renamingId, { name })
    }
    setRenamingId(null)
  }

  const handleAdd = () => {
    const center = screenToWorld(
      { x: stageSize.width / 2, y: stageSize.height / 2 },
      viewport,
    )
    const id = addZone(snapToGrid ? snapPoint(center, gridSize) : center)
    selectZone(id)
    startRename(id, `Zone ${zones.length + 1}`)
  }

  // Fit the canvas to a zone (+ padding) and isolate it for easier editing.
  const focusZone = (zone: Zone) => {
    if (!stageSize.width || !stageSize.height) return
    const pad = gridSize * FOCUS_PADDING_SQUARES
    const worldW = zone.size.x + pad * 2
    const worldH = zone.size.y + pad * 2
    const zoom = clamp(
      Math.min(stageSize.width / worldW, stageSize.height / worldH),
      MIN_ZOOM,
      MAX_ZOOM,
    )
    setViewport({
      zoom,
      pan: {
        x: stageSize.width / 2 - zone.position.x * zoom,
        y: stageSize.height / 2 - zone.position.y * zoom,
      },
    })
    setFocusedZone(zone.id)
    selectZone(zone.id)
    onClosePanel?.()
  }

  const handleDelete = (id: string) => {
    if (focusedZoneId === id) setFocusedZone(null)
    removeZone(id)
  }

  return (
    <aside className="flex w-64 flex-col border-l border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Zones</h2>
        <button
          aria-label="Add zone"
          onClick={handleAdd}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          +
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
        {zones.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted">
            No zones yet — add one with the + above.
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
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: zone.color }}
              />
              {renamingId === zone.id ? (
                <input
                  ref={inputRef}
                  value={draft}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  className="w-full rounded border border-line bg-surface px-1 text-sm text-ink focus:outline-none"
                />
              ) : (
                <span
                  className="truncate text-ink"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    startRename(zone.id, zone.name)
                  }}
                >
                  {zone.name}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums text-xs text-muted">{countFor(zone.id)}</span>
              <button
                aria-label={`Focus ${zone.name}`}
                title="Focus zone"
                onClick={(e) => {
                  e.stopPropagation()
                  focusZone(zone)
                }}
                className={cn(
                  'transition-opacity hover:text-ink',
                  focusedZoneId === zone.id
                    ? 'text-ink opacity-100'
                    : 'text-muted opacity-0 group-hover:opacity-100',
                )}
              >
                ⤢
              </button>
              <button
                aria-label={`Delete ${zone.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(zone.id)
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
