import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { useHistoryStore, useLayoutStore, useSettingsStore, useUIStore } from '@/stores'
import { clamp, screenToWorld, snapPoint } from '@/utils'
import { parseLayoutFile, serializeLayout } from '@/services/layoutStorage'
import { duplicateSelection } from './hooks/useEditorShortcuts'
import { useEditorFit } from './hooks/useEditorFit'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

interface ToolbarProps {
  /** Toggles the zones drawer on small screens. */
  onToggleZones?: () => void
}

/** Editor toolbar — add tables, delete, undo/redo, zoom, snap. */
export function Toolbar({ onToggleZones }: ToolbarProps) {
  const { t } = useTranslation('editor')
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const addTable = useLayoutStore((s) => s.addTable)
  const addObstacle = useLayoutStore((s) => s.addObstacle)
  const removeTables = useLayoutStore((s) => s.removeTables)
  const removeObstacle = useLayoutStore((s) => s.removeObstacle)
  const tables = useLayoutStore((s) => s.tables)
  const mergeTables = useLayoutStore((s) => s.mergeTables)
  const splitGroup = useLayoutStore((s) => s.splitGroup)
  const rotateSelection90 = useLayoutStore((s) => s.rotateSelection90)
  const undo = useLayoutStore((s) => s.undo)
  const redo = useLayoutStore((s) => s.redo)
  const loadSnapshot = useLayoutStore((s) => s.loadSnapshot)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const canUndo = useHistoryStore((s) => s.past.length > 0)
  const canRedo = useHistoryStore((s) => s.future.length > 0)

  const viewport = useUIStore((s) => s.viewport)
  const stageSize = useUIStore((s) => s.stageSize)
  const setViewport = useUIStore((s) => s.setViewport)
  const fitContent = useEditorFit()
  const selectedIds = useUIStore((s) => s.selectedTableIds)
  const selectedObstacleId = useUIStore((s) => s.selectedObstacleId)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const tool = useUIStore((s) => s.tool)
  const setTool = useUIStore((s) => s.setTool)

  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const setSnapToGrid = useSettingsStore((s) => s.setSnapToGrid)
  const pathWidth = useSettingsStore((s) => s.pathWidth)
  const setPathWidth = useSettingsStore((s) => s.setPathWidth)

  const togglePathTool = () => {
    const next = tool === 'path' ? 'select' : 'path'
    setTool(next)
    if (next === 'path') clearSelection()
  }

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

  // Merge needs 2+ tables that aren't already one single group; split needs a group.
  const selectedTables = tables.filter((t) => selectedIds.includes(t.id))
  const groupId = selectedTables.find((t) => t.mergedGroupId)?.mergedGroupId
  const allOneGroup =
    !!groupId && selectedTables.every((t) => t.mergedGroupId === groupId)
  const canMerge = selectedIds.length >= 2 && !allOneGroup
  const canSplit = !!groupId

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
    else alert(t('loadError'))
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
            {t('zonesMobile')}
          </Button>
          <span className="mx-1 h-5 w-px bg-line md:hidden" />
        </>
      )}

      <span className="me-1 text-xs font-medium text-muted">{t('add')}</span>
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

      <span className="me-1 text-xs font-medium text-muted">{t('barrier')}</span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => addObstacle('wall', viewCenterWorld())}
      >
        {t('wall')}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => addObstacle('object', viewCenterWorld())}
      >
        {t('object')}
      </Button>
      <Button
        size="sm"
        variant={tool === 'path' ? 'primary' : 'secondary'}
        onClick={togglePathTool}
        title={t('pathTitle')}
      >
        {t('path')}
      </Button>
      {tool === 'path' && (
        <label className="flex items-center gap-1.5 text-xs text-muted">
          {t('width')}
          <input
            type="range"
            min={12}
            max={120}
            step={2}
            value={pathWidth}
            onChange={(e) => setPathWidth(Number(e.target.value))}
            className="w-20 accent-ink"
          />
          <span className="w-6 tabular-nums">{pathWidth}</span>
        </label>
      )}

      <span className="mx-1 h-5 w-px bg-line" />

      <Button size="sm" variant="ghost" onClick={handleDelete} disabled={!hasSelection}>
        {t('delete')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => mergeTables(selectedIds)}
        disabled={!canMerge}
        title={t('mergeTitle')}
      >
        {t('merge')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => groupId && splitGroup(groupId)}
        disabled={!canSplit}
        title={t('splitTitle')}
      >
        {t('split')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => rotateSelection90(selectedIds)}
        disabled={!selectedIds.length}
        title="Rotate the selection 90° (R)"
      >
        Rotate
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={duplicateSelection}
        disabled={!hasSelection}
        title="Duplicate the selection (⌘D)"
      >
        Duplicate
      </Button>
      <Button size="sm" variant="ghost" onClick={undo} disabled={!canUndo}>
        {t('undo')}
      </Button>
      <Button size="sm" variant="ghost" onClick={redo} disabled={!canRedo}>
        {t('redo')}
      </Button>

      <span className="mx-1 h-5 w-px bg-line" />

      <Button size="sm" variant="ghost" onClick={() => zoomBy(1 / 1.2)}>
        −
      </Button>
      <button
        className="min-w-14 rounded-lg px-2 py-1 text-xs tabular-nums text-muted hover:text-ink"
        onClick={() => setViewport({ zoom: 1, pan: { x: 0, y: 0 } })}
        title={t('resetView')}
      >
        {Math.round(viewport.zoom * 100)}%
      </button>
      <Button size="sm" variant="ghost" onClick={() => zoomBy(1.2)}>
        +
      </Button>
      <Button size="sm" variant="ghost" onClick={() => fitContent()} title={t('fitTitle')}>
        {t('fit')}
      </Button>

      <span className="mx-1 h-5 w-px bg-line" />

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={snapToGrid}
          onChange={(e) => setSnapToGrid(e.target.checked)}
        />
        {t('snap')}
      </label>

      <span className="mx-1 h-5 w-px bg-line" />

      <Button size="sm" variant="ghost" onClick={handleSave}>
        {t('save')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
        {t('load')}
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
