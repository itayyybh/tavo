import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Rect, Stage } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useLayoutStore, useSettingsStore, useUIStore } from '@/stores'
import { useContainerSize } from '@/hooks/useContainerSize'
import {
  aabb,
  clamp,
  hiddenZoneIds,
  innermostZoneAt,
  overlapArea,
  pointInRect,
  screenToWorld,
  snap,
  snapPoint,
  worldToScreen,
  zoneAncestorIds,
  zoneDepth,
  zonesById,
} from '@/utils'
import type { Vec2 } from '@/types'
import { GridBackground } from './GridBackground'
import { ZoneShape } from './ZoneShape'
import { TableShape } from './TableShape'
import { ObstacleShape } from './ObstacleShape'
import { SelectionTransformer } from './SelectionTransformer'
import { ObstacleTransformer } from './ObstacleTransformer'
import { ZoneTransformer } from './ZoneTransformer'
import { useCanvasColors } from './hooks/useCanvasColors'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 1.03
const MIN_TABLE_SIZE = 30
// Overlap up to this fraction of a table's area is tolerated (edges/slight touch ok).
const OVERLAP_TOLERANCE = 0.1

interface Marquee {
  start: Vec2
  end: Vec2
}

interface RenameState {
  kind: 'table' | 'zone'
  id: string
  value: string
}

/** The interactive editor canvas: pan, zoom, marquee-select, drag, rotate, obstacles. */
export function EditorCanvas() {
  const { ref: containerRef, size } = useContainerSize<HTMLDivElement>()
  const stageRef = useRef<Konva.Stage>(null)
  const nodeRefs = useRef<Map<string, Konva.Group>>(new Map())
  const obstacleRefs = useRef<Map<string, Konva.Node>>(new Map())
  const zoneRefs = useRef<Map<string, Konva.Group>>(new Map())
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [rename, setRename] = useState<RenameState | null>(null)

  const viewport = useUIStore((s) => s.viewport)
  const selectedIds = useUIStore((s) => s.selectedTableIds)
  const selectedObstacleId = useUIStore((s) => s.selectedObstacleId)
  const selectedZoneId = useUIStore((s) => s.selectedZoneId)
  const setViewport = useUIStore((s) => s.setViewport)
  const setStageSize = useUIStore((s) => s.setStageSize)
  const setSelection = useUIStore((s) => s.setSelection)
  const toggleSelection = useUIStore((s) => s.toggleSelection)
  const selectObstacle = useUIStore((s) => s.selectObstacle)
  const selectZone = useUIStore((s) => s.selectZone)
  const clearSelection = useUIStore((s) => s.clearSelection)

  const tables = useLayoutStore((s) => s.tables)
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const obstacles = useLayoutStore((s) => s.obstacles)
  const zones = useLayoutStore((s) => s.zones)
  const updateTable = useLayoutStore((s) => s.updateTable)
  const moveTablesBy = useLayoutStore((s) => s.moveTablesBy)
  const updateObstacle = useLayoutStore((s) => s.updateObstacle)
  const updateZone = useLayoutStore((s) => s.updateZone)

  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const colors = useCanvasColors()

  const zonesIndex = useMemo(() => zonesById(zones), [zones])
  // Parents render before children so nested zones stack on top and stay clickable.
  const zonesByDepth = useMemo(
    () => [...zones].sort((a, b) => zoneDepth(a, zonesIndex) - zoneDepth(b, zonesIndex)),
    [zones, zonesIndex],
  )
  // Tables inside a locked zone's subtree are hidden (zone shells stay visible).
  const hiddenZones = useMemo(() => hiddenZoneIds(zones), [zones])
  const visibleTables = useMemo(
    () => tables.filter((t) => !hiddenZones.has(t.zoneId)),
    [tables, hiddenZones],
  )

  useEffect(() => setStageSize(size), [size, setStageSize])

  // Track Space for pan mode (ignored while typing in the rename field).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement))
        setSpaceDown(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Focus + select text only when a rename STARTS (keyed by target id), not on
  // every keystroke — otherwise each typed char re-selects and gets overwritten.
  const renameId = rename?.id
  useEffect(() => {
    if (renameId) renameInputRef.current?.select()
  }, [renameId])

  const registerNode = useCallback((id: string, node: Konva.Group | null) => {
    if (node) nodeRefs.current.set(id, node)
    else nodeRefs.current.delete(id)
  }, [])
  const getNode = useCallback((id: string) => nodeRefs.current.get(id), [])

  const registerObstacleNode = useCallback((id: string, node: Konva.Node | null) => {
    if (node) obstacleRefs.current.set(id, node)
    else obstacleRefs.current.delete(id)
  }, [])
  const getObstacleNode = useCallback((id: string) => obstacleRefs.current.get(id), [])

  const registerZoneNode = useCallback((id: string, node: Konva.Group | null) => {
    if (node) zoneRefs.current.set(id, node)
    else zoneRefs.current.delete(id)
  }, [])
  const getZoneNode = useCallback((id: string) => zoneRefs.current.get(id), [])

  const maybeSnap = useCallback(
    (p: Vec2) => (snapToGrid ? snapPoint(p, gridSize) : p),
    [snapToGrid, gridSize],
  )

  /**
   * A placement is rejected only when a table overlaps another table or a wall by
   * more than a fraction of its own area. Edges touching and slight overlaps are
   * fine; chair clearance is now just the visual halo, not a hard rule.
   * `ignore` skips tables that move together.
   */
  const overlapsTooMuch = useCallback(
    (center: Vec2, size: Vec2, ignore: Set<string>) => {
      const box = aabb(center, size)
      const limit = size.x * size.y * OVERLAP_TOLERANCE
      const hitsWall = obstacles.some(
        (o) => overlapArea(box, aabb(o.position, o.size)) > limit,
      )
      const hitsTable = tables.some(
        (o) => !ignore.has(o.id) && overlapArea(box, aabb(o.position, o.size)) > limit,
      )
      // Nested zones are no-go regions: a table may only intrude into a child
      // zone it belongs to (its innermost zone, by center) or an ancestor of it.
      const ownZone = innermostZoneAt(center, zones, zonesIndex)
      const allowed = new Set<string>([ownZone, ...zoneAncestorIds(ownZone, zonesIndex)])
      const hitsChildZone = zones.some(
        (z) =>
          z.parentId &&
          !allowed.has(z.id) &&
          overlapArea(box, aabb(z.position, z.size)) > limit,
      )
      return hitsWall || hitsTable || hitsChildZone
    },
    [obstacles, tables, zones, zonesIndex],
  )

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    const { pan, zoom } = viewport

    if (e.evt.ctrlKey) {
      const factor = e.evt.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
      const newZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM)
      const world = screenToWorld(pointer, viewport)
      setViewport({
        zoom: newZoom,
        pan: { x: pointer.x - world.x * newZoom, y: pointer.y - world.y * newZoom },
      })
    } else {
      setViewport({ zoom, pan: { x: pan.x - e.evt.deltaX, y: pan.y - e.evt.deltaY } })
    }
  }

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (spaceDown) return
    if (e.target !== e.target.getStage()) return
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    const world = screenToWorld(pointer, viewport)
    setMarquee({ start: world, end: world })
  }

  const handleStageMouseMove = () => {
    if (!marquee) return
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    setMarquee({ ...marquee, end: screenToWorld(pointer, viewport) })
  }

  const handleStageMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    if (!marquee) return
    const rect = {
      x: Math.min(marquee.start.x, marquee.end.x),
      y: Math.min(marquee.start.y, marquee.end.y),
      width: Math.abs(marquee.end.x - marquee.start.x),
      height: Math.abs(marquee.end.y - marquee.start.y),
    }
    setMarquee(null)
    if (rect.width < 4 && rect.height < 4) {
      clearSelection()
      return
    }
    const hits = visibleTables
      .filter((t) => pointInRect(t.position, rect))
      .map((t) => t.id)
    setSelection(e.evt.shiftKey ? [...new Set([...selectedIds, ...hits])] : hits)
  }

  const handleStageDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return
    const stage = stageRef.current
    if (!stage) return
    setViewport({ zoom: viewport.zoom, pan: { x: stage.x(), y: stage.y() } })
  }

  // Double-click on empty floor inside a zone selects that zone (innermost wins).
  const handleStageDblClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.target.getStage()) return
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    const world = screenToWorld(pointer, viewport)
    const hit = innermostZoneAt(world, zones, zonesIndex)
    if (hit) selectZone(hit)
  }

  const handleTableDragEnd = (id: string, center: Vec2) => {
    const table = tables.find((t) => t.id === id)
    if (!table) return
    const movingIds =
      selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id]
    const movingSet = new Set(movingIds)
    const snapped = maybeSnap(center)
    const delta = { x: snapped.x - table.position.x, y: snapped.y - table.position.y }

    // Revert only if a table would overlap another table/wall beyond the tolerance.
    const blocked = movingIds.some((mid) => {
      const t = tables.find((x) => x.id === mid)
      if (!t) return false
      const newCenter =
        mid === id ? snapped : { x: t.position.x + delta.x, y: t.position.y + delta.y }
      return overlapsTooMuch(newCenter, t.size, movingSet)
    })

    if (blocked) {
      // Snap every moved node back to its stored position.
      movingIds.forEach((mid) => {
        const t = tables.find((x) => x.id === mid)
        const node = getNode(mid)
        if (t && node) node.position({ x: t.position.x, y: t.position.y })
      })
      getNode(id)?.getLayer()?.batchDraw()
      return
    }

    if (movingIds.length > 1) moveTablesBy(movingIds, delta)
    else updateTable(id, { position: snapped })
  }

  const handleTableTransformEnd = (
    id: string,
    scale: Vec2,
    rotation: number,
    center: Vec2,
  ) => {
    const table = tables.find((t) => t.id === id)
    if (!table) return

    const raw = { x: table.size.x * scale.x, y: table.size.y * scale.y }
    const newSize = {
      x: Math.max(MIN_TABLE_SIZE, snapToGrid ? snap(raw.x, gridSize) : raw.x),
      y: Math.max(MIN_TABLE_SIZE, snapToGrid ? snap(raw.y, gridSize) : raw.y),
    }
    const newCenter = maybeSnap(center)
    const only = new Set([id])

    const blocked = overlapsTooMuch(newCenter, newSize, only)

    if (blocked) {
      // Revert the node to its stored transform.
      const node = getNode(id)
      if (node) {
        node.scaleX(1)
        node.scaleY(1)
        node.position({ x: table.position.x, y: table.position.y })
        node.rotation(table.rotation)
        node.getLayer()?.batchDraw()
      }
      return
    }

    updateTable(id, { size: newSize, rotation, position: newCenter })
  }

  const handleObstacleDragEnd = (id: string, center: Vec2) => {
    updateObstacle(id, { position: maybeSnap(center) })
  }

  const handleObstacleTransformEnd = (
    id: string,
    obstacleSize: Vec2,
    center: Vec2,
    rotation: number,
  ) => {
    updateObstacle(id, { size: obstacleSize, position: center, rotation })
  }

  const handleZoneDragEnd = (id: string, center: Vec2) => {
    updateZone(id, { position: maybeSnap(center) })
  }

  const handleZoneTransformEnd = (id: string, scale: Vec2, center: Vec2) => {
    const zone = zones.find((z) => z.id === id)
    if (!zone) return
    updateZone(id, {
      size: { x: zone.size.x * scale.x, y: zone.size.y * scale.y },
      position: maybeSnap(center),
    })
  }

  const startRenameTable = (id: string) => {
    const table = tables.find((t) => t.id === id)
    if (!table) return
    setSelection([id])
    setRename({ kind: 'table', id, value: table.label })
  }

  const commitRename = () => {
    if (!rename) return
    const value = rename.value.trim()
    if (value && rename.kind === 'table') updateTable(rename.id, { label: value })
    if (value && rename.kind === 'zone') updateZone(rename.id, { name: value })
    setRename(null)
  }

  // Screen position for the inline rename input: table center, or zone label corner.
  let renamePos = { x: 0, y: 0 }
  let renameActive = false
  if (rename?.kind === 'table') {
    const t = tables.find((x) => x.id === rename.id)
    if (t) {
      renamePos = worldToScreen(t.position, viewport)
      renameActive = true
    }
  } else if (rename?.kind === 'zone') {
    const z = zones.find((x) => x.id === rename.id)
    if (z) {
      const corner = {
        x: z.position.x - z.size.x / 2 + 56,
        y: z.position.y - z.size.y / 2 + 11,
      }
      renamePos = worldToScreen(corner, viewport)
      renameActive = true
    }
  }

  // Put the resize/rotate anchors right on the clearance ("chair") line — no border box.
  const selectedTable =
    selectedIds.length === 1 ? tables.find((t) => t.id === selectedIds[0]) : undefined
  const tableHandlePadding = selectedTable
    ? (tableTypes.find((t) => t.id === selectedTable.typeId)?.clearance ?? 0)
    : 0

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      style={{ cursor: spaceDown ? 'grab' : 'default' }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={viewport.zoom}
        scaleY={viewport.zoom}
        x={viewport.pan.x}
        y={viewport.pan.y}
        draggable={spaceDown}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onDblClick={handleStageDblClick}
        onDragEnd={handleStageDragEnd}
      >
        <Layer>
          <GridBackground
            viewport={viewport}
            stageSize={size}
            gridSize={gridSize}
            color={colors.line}
          />
        </Layer>
        <Layer>
          {zonesByDepth.map((zone) => (
            <ZoneShape
              key={zone.id}
              zone={zone}
              depth={zoneDepth(zone, zonesIndex)}
              colors={colors}
              selected={selectedZoneId === zone.id}
              onSelect={selectZone}
              onDragEnd={handleZoneDragEnd}
              registerNode={registerZoneNode}
            />
          ))}
          {obstacles.map((obstacle) => (
            <ObstacleShape
              key={obstacle.id}
              obstacle={obstacle}
              colors={colors}
              selected={selectedObstacleId === obstacle.id}
              onSelect={selectObstacle}
              onDragEnd={handleObstacleDragEnd}
              registerNode={registerObstacleNode}
            />
          ))}
          {visibleTables.map((table) => (
            <TableShape
              key={table.id}
              table={table}
              type={tableTypes.find((t) => t.id === table.typeId)}
              colors={colors}
              zoneColor={zones.find((z) => z.id === table.zoneId)?.color}
              selected={selectedIds.includes(table.id)}
              onSelect={toggleSelection}
              onDragEnd={handleTableDragEnd}
              onStartRename={startRenameTable}
              registerNode={registerNode}
            />
          ))}
          {marquee && (
            <Rect
              x={Math.min(marquee.start.x, marquee.end.x)}
              y={Math.min(marquee.start.y, marquee.end.y)}
              width={Math.abs(marquee.end.x - marquee.start.x)}
              height={Math.abs(marquee.end.y - marquee.start.y)}
              fill={colors.ink}
              opacity={0.06}
              stroke={colors.muted}
              strokeWidth={1 / viewport.zoom}
              perfectDrawEnabled={false}
              listening={false}
            />
          )}
          <SelectionTransformer
            selectedIds={selectedIds}
            tablesVersion={tables.length}
            colors={colors}
            padding={tableHandlePadding}
            getNode={getNode}
            onTransformEnd={handleTableTransformEnd}
          />
          <ObstacleTransformer
            selectedId={selectedObstacleId}
            obstaclesVersion={obstacles.length}
            colors={colors}
            getNode={getObstacleNode}
            onTransformEnd={handleObstacleTransformEnd}
          />
          <ZoneTransformer
            selectedId={selectedZoneId}
            zonesVersion={zones.length}
            colors={colors}
            getNode={getZoneNode}
            onTransformEnd={handleZoneTransformEnd}
          />
        </Layer>
      </Stage>

      {rename && renameActive && (
        <input
          ref={renameInputRef}
          value={rename.value}
          onChange={(e) => setRename({ ...rename, value: e.target.value })}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setRename(null)
          }}
          className="absolute z-10 h-7 w-28 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-ink bg-surface px-2 text-center text-sm text-ink shadow-[var(--shadow-soft)] focus:outline-none"
          style={{ left: renamePos.x, top: renamePos.y }}
        />
      )}
    </div>
  )
}
