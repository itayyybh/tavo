import { Button } from '@/components/ui'
import { useHistoryStore, useLayoutStore, useSettingsStore, useUIStore } from '@/stores'
import { clamp, screenToWorld, snapPoint } from '@/utils'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

/** Editor toolbar — add tables, delete, undo/redo, zoom, snap. */
export function Toolbar() {
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const addTable = useLayoutStore((s) => s.addTable)
  const addObstacle = useLayoutStore((s) => s.addObstacle)
  const removeTables = useLayoutStore((s) => s.removeTables)
  const removeObstacle = useLayoutStore((s) => s.removeObstacle)
  const undo = useLayoutStore((s) => s.undo)
  const redo = useLayoutStore((s) => s.redo)

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
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
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
    </div>
  )
}
