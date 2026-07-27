import { useRef } from 'react'
import { Button } from '@/components/ui'
import { useHistoryStore, useLayoutStore, useSettingsStore, useUIStore } from '@/stores'
import { clamp, screenToWorld, snapPoint } from '@/utils'
import { parseLayoutFile, serializeLayout } from '@/services/layoutStorage'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

interface ToolbarProps {
  /** Toggles the zones drawer on small screens. */
  onToggleZones?: () => void
}

/** Editor toolbar — add tables, delete, undo/redo, zoom, snap. */
export function Toolbar({ onToggleZones }: ToolbarProps) {
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const addTable = useLayoutStore((s) => s.addTable)
  const addObstacle = useLayoutStore((s) => s.addObstacle)
  const removeTables = useLayoutStore((s) => s.removeTables)
  const removeObstacle = useLayoutStore((s) => s.removeObstacle)
  const undo = useLayoutStore((s) => s.undo)
  const redo = useLayoutStore((s) => s.redo)
  const loadSnapshot = useLayoutStore((s) => s.loadSnapshot)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const canUndo = useHistoryStore((s) => s.past.length > 0)
  const canRedo = useHistoryStore((s) => s.future.length > 0)

  const viewport = useUIStore((s) => s.viewport)
  const stageSize = useUIStore((s) => s.stageSize)
  const setViewport = useUIStore((s) => s.setViewport)
  const selectedIds = useUIStore((s) => s.selectedTableIds)
  const selectedObstacleId = useUIStore((s) => s.selectedObstacleId)
  const clearSelection = useUIStore((s) => s.clearSelection)

  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const setSnapToGrid = useSettingsStore((s) => s.setSnapToGrid)

  const viewCenterWorld = () => {
    const center = { x: stageSize.width / 2, y: stageSize.height / 2 }
    const world = screenToWorld(center, viewport)
    return snapToGrid ? snapPoint(world, gridSize) : world
  }

  const handleAdd = (typeId: string) => addTable(typeId, viewCenterWorld())

  const hasSelection = selectedIds.length > 0 || selectedObstacleId !== null
  const handleDelete = () => {
    if (selectedObstacleId) removeObstacle(selectedObstacleId)
    else removeTables(selectedIds)
    clearSelection()
  }

  const handleSave = () => {
    const snapshot = useLayoutStore.getState().snapshot()
    const blob = new Blob([serializeLayout(snapshot)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'restaurant-layout.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleLoadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-importing the same file
    if (!file) return
    const snapshot = parseLayoutFile(await file.text())
    if (snapshot) loadSnapshot(snapshot)
    else alert('Could not read that layout file.')
  }

  const zoomBy = (factor: number) => {
    const newZoom = clamp(viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM)
    const center = { x: stageSize.width / 2, y: stageSize.height / 2 }
    const world = screenToWorld(center, viewport)
    setViewport({
      zoom: newZoom,
      pan: { x: center.x - world.x * newZoom, y: center.y - world.y * newZoom },
    })
  }

  return (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-line bg-surface px-4 py-2 [&>*]:shrink-0 md:flex-wrap md:overflow-visible">
      {onToggleZones && (
        <>
          <Button
            size="sm"
            variant="secondary"
            className="md:hidden"
            onClick={onToggleZones}
          >
            Zones
          </Button>
          <span className="mx-1 h-5 w-px bg-line md:hidden" />
        </>
      )}

      <span className="mr-1 text-xs font-medium text-muted">Add</span>
      {tableTypes.map((type) => (
        <Button
          key={type.id}
          size="sm"
          variant="secondary"
          onClick={() => handleAdd(type.id)}
        >
          {type.name}
        </Button>
      ))}

      <span className="mx-1 h-5 w-px bg-line" />

      <span className="mr-1 text-xs font-medium text-muted">Barrier</span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => addObstacle('wall', viewCenterWorld())}
      >
        Wall
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => addObstacle('object', viewCenterWorld())}
      >
        Object
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => addObstacle('path', viewCenterWorld())}
        title="Keep-clear lane — tables can't be placed here (e.g. kitchen path, exit)"
      >
        Path
      </Button>

      <span className="mx-1 h-5 w-px bg-line" />

      <Button size="sm" variant="ghost" onClick={handleDelete} disabled={!hasSelection}>
        Delete
      </Button>
      <Button size="sm" variant="ghost" onClick={undo} disabled={!canUndo}>
        Undo
      </Button>
      <Button size="sm" variant="ghost" onClick={redo} disabled={!canRedo}>
        Redo
      </Button>

      <span className="mx-1 h-5 w-px bg-line" />

      <Button size="sm" variant="ghost" onClick={() => zoomBy(1 / 1.2)}>
        −
      </Button>
      <button
        className="min-w-14 rounded-lg px-2 py-1 text-xs tabular-nums text-muted hover:text-ink"
        onClick={() => setViewport({ zoom: 1, pan: { x: 0, y: 0 } })}
        title="Reset view"
      >
        {Math.round(viewport.zoom * 100)}%
      </button>
      <Button size="sm" variant="ghost" onClick={() => zoomBy(1.2)}>
        +
      </Button>

      <span className="mx-1 h-5 w-px bg-line" />

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={snapToGrid}
          onChange={(e) => setSnapToGrid(e.target.checked)}
        />
        Snap
      </label>

      <span className="mx-1 h-5 w-px bg-line" />

      <Button size="sm" variant="ghost" onClick={handleSave}>
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
        Load
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleLoadFile}
      />
    </div>
  )
}
