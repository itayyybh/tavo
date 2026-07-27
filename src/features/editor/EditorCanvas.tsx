import { useCallback, useEffect, useRef, useState } from 'react'
import { Layer, Line, Rect, Stage } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useLayoutStore, useSettingsStore, useUIStore } from '@/stores'
import { useContainerSize } from '@/hooks/useContainerSize'
import {
  aabb,
  boxBlocked,
  clamp,
  overlapArea,
  pointInRect,
  screenToWorld,
  snap,
  snapPoint,
  worldToScreen,
} from '@/utils'
import type { Vec2 } from '@/types'
import { GridBackground } from './GridBackground'
import { ZoneShape } from './ZoneShape'
import { TableShape } from './TableShape'
import { ObstacleShape } from './ObstacleShape'
import { MergedHulls } from './MergedHulls'
import { SelectionTransformer } from './SelectionTransformer'
import { ObstacleTransformer } from './ObstacleTransformer'
import { ZoneTransformer } from './ZoneTransformer'
import { useCanvasColors } from './hooks/useCanvasColors'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 1.03
const MIN_TABLE_SIZE = 30

// Minimum world-space distance between sampled brush points while drawing a path.
const BRUSH_SAMPLE_DIST = 4

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
  const overlayRefs = useRef<Map<string, Konva.Group>>(new Map())
  const obstacleRefs = useRef<Map<string, Konva.Node>>(new Map())
  const zoneRefs = useRef<Map<string, Konva.Group>>(new Map())
  const renameInputRef = useRef<HTMLInputElement>(null)
  // Touch pinch-zoom state (distance + midpoint between the two fingers).
  const lastPinchDist = useRef(0)
  const lastPinchCenter = useRef<Vec2 | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [rename, setRename] = useState<RenameState | null>(null)
  // In-progress freehand brush stroke (world points), while the path tool draws.
  const [draftPath, setDraftPath] = useState<Vec2[] | null>(null)

  const viewport = useUIStore((s) => s.viewport)
  const selectedIds = useUIStore((s) => s.selectedTableIds)
  const selectedObstacleId = useUIStore((s) => s.selectedObstacleId)
  const selectedZoneId = useUIStore((s) => s.selectedZoneId)
  const setViewport = useUIStore((s) => s.setViewport)
  const setStageSize = useUIStore((s) => s.setStageSize)
  const setSelection = useUIStore((s) => s.setSelection)
  const selectObstacle = useUIStore((s) => s.selectObstacle)
  const selectZone = useUIStore((s) => s.selectZone)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const focusedZoneId = useUIStore((s) => s.focusedZoneId)
  const setFocusedZone = useUIStore((s) => s.setFocusedZone)
  const tool = useUIStore((s) => s.tool)

  const tables = useLayoutStore((s) => s.tables)
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const obstacles = useLayoutStore((s) => s.obstacles)
  const zones = useLayoutStore((s) => s.zones)
  const mergedGroups = useLayoutStore((s) => s.mergedGroups)
  const updateTable = useLayoutStore((s) => s.updateTable)
  const moveTablesBy = useLayoutStore((s) => s.moveTablesBy)
  const updateObstacle = useLayoutStore((s) => s.updateObstacle)
  const updateZone = useLayoutStore((s) => s.updateZone)
  const addPath = useLayoutStore((s) => s.addPath)

  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const pathWidth = useSettingsStore((s) => s.pathWidth)
  const colors = useCanvasColors()

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

  const registerOverlayNode = useCallback((id: string, node: Konva.Group | null) => {
    if (node) overlayRefs.current.set(id, node)
    else overlayRefs.current.delete(id)
  }, [])

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

  // A merged table behaves as one unit: expand any id to all its group members.
  const expandGroups = useCallback(
    (ids: string[]) => {
      const out = new Set<string>()
      for (const id of ids) {
        const t = tables.find((x) => x.id === id)
        const group = t?.mergedGroupId
          ? mergedGroups.find((g) => g.id === t.mergedGroupId)
          : undefined
        if (group) group.tableIds.forEach((m) => out.add(m))
        else out.add(id)
      }
      return [...out]
    },
    [tables, mergedGroups],
  )

  // Selecting a table selects its whole merged group; shift toggles that group.
  const handleSelectTable = useCallback(
    (id: string, additive: boolean) => {
      const groupIds = expandGroups([id])
      if (!additive) {
        setSelection(groupIds)
        return
      }
      const allIn = groupIds.every((g) => selectedIds.includes(g))
      setSelection(
        allIn
          ? selectedIds.filter((s) => !groupIds.includes(s))
          : [...new Set([...selectedIds, ...groupIds])],
      )
    },
    [expandGroups, selectedIds, setSelection],
  )

  /**
   * A placement is rejected only when a table overlaps another table or a wall by
   * more than a fraction of its own area. Edges touching and slight overlaps are
   * fine; chair clearance is now just the visual halo, not a hard rule.
   * `ignore` skips tables that move together.
   */
  const overlapsTooMuch = useCallback(
    (center: Vec2, size: Vec2, ignore: Set<string>) =>
      boxBlocked(aabb(center, size), tables, obstacles, ignore),
    [obstacles, tables],
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

  // --- Freehand path brush ---
  const pointerWorld = () => {
    const p = stageRef.current?.getPointerPosition()
    return p ? screenToWorld(p, viewport) : null
  }
  const beginDraw = () => {
    const w = pointerWorld()
    if (w) setDraftPath([w])
  }
  const extendDraw = () => {
    const w = pointerWorld()
    if (!w) return
    setDraftPath((prev) => {
      if (!prev) return prev
      const last = prev[prev.length - 1]
      if (Math.hypot(w.x - last.x, w.y - last.y) < BRUSH_SAMPLE_DIST) return prev
      return [...prev, w]
    })
  }
  const endDraw = () => {
    if (draftPath && draftPath.length >= 2) addPath(draftPath, pathWidth)
    setDraftPath(null)
  }

  // One finger on empty floor pans (via native stage drag); two fingers pinch-zoom.
  const handleTouchStart = (e: KonvaEventObject<TouchEvent>) => {
    const stage = stageRef.current
    if (!stage) return
    if (tool === 'path') {
      stage.draggable(false)
      beginDraw()
      return
    }
    if (e.evt.touches.length === 1 && e.target === stage) stage.draggable(true)
  }

  const handleTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const stage = stageRef.current
    const touches = e.evt.touches
    if (!stage) return
    if (tool === 'path') {
      e.evt.preventDefault()
      extendDraw()
      return
    }
    if (touches.length < 2) return
    e.evt.preventDefault()
    stage.draggable(false)

    const box = stage.container().getBoundingClientRect()
    const p1 = { x: touches[0].clientX - box.left, y: touches[0].clientY - box.top }
    const p2 = { x: touches[1].clientX - box.left, y: touches[1].clientY - box.top }
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

    if (!lastPinchDist.current || !lastPinchCenter.current) {
      lastPinchDist.current = dist
      lastPinchCenter.current = center
      return
    }

    const newZoom = clamp(
      viewport.zoom * (dist / lastPinchDist.current),
      MIN_ZOOM,
      MAX_ZOOM,
    )
    const world = screenToWorld(center, viewport)
    // Keep the pinch midpoint anchored, and pan by how far it moved this frame.
    const pan = {
      x: center.x - world.x * newZoom + (center.x - lastPinchCenter.current.x),
      y: center.y - world.y * newZoom + (center.y - lastPinchCenter.current.y),
    }
    setViewport({ zoom: newZoom, pan })
    lastPinchDist.current = dist
    lastPinchCenter.current = center
  }

  const handleTouchEnd = () => {
    if (tool === 'path') {
      endDraw()
      return
    }
    lastPinchDist.current = 0
    lastPinchCenter.current = null
    stageRef.current?.draggable(spaceDown)
  }

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (spaceDown) return
    if (tool === 'path') {
      beginDraw()
      return
    }
    if (e.target !== e.target.getStage()) return
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    const world = screenToWorld(pointer, viewport)
    setMarquee({ start: world, end: world })
  }

  const handleStageMouseMove = () => {
    if (tool === 'path') {
      if (draftPath) extendDraw()
      return
    }
    if (!marquee) return
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    setMarquee({ ...marquee, end: screenToWorld(pointer, viewport) })
  }

  const handleStageMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    if (tool === 'path') {
      endDraw()
      return
    }
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
    const hits = expandGroups(
      tables.filter((t) => pointInRect(t.position, rect)).map((t) => t.id),
    )
    setSelection(e.evt.shiftKey ? [...new Set([...selectedIds, ...hits])] : hits)
  }

  const handleStageDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return
    const stage = stageRef.current
    if (!stage) return
    setViewport({ zoom: viewport.zoom, pan: { x: stage.x(), y: stage.y() } })
  }

  // Double-click on empty floor inside a zone selects that zone (topmost wins).
  const handleStageDblClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.target.getStage()) return
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    const world = screenToWorld(pointer, viewport)
    let hit: string | null = null
    for (const z of zones) {
      if (pointInRect(world, aabb(z.position, z.size))) hit = z.id
    }
    if (hit) selectZone(hit)
  }

  // Which merged groups move entirely with the given set (so their body tracks).
  const overlayGroupsFor = (movingSet: Set<string>) =>
    mergedGroups.filter(
      (g) => g.tableIds.length > 0 && g.tableIds.every((tid) => movingSet.has(tid)),
    )

  // While a member is dragged, move its siblings and the merged body live so the
  // whole group travels as one — not just the grabbed table with a lagging body.
  const handleTableDragMove = (id: string) => {
    const table = tables.find((t) => t.id === id)
    const node = getNode(id)
    if (!table || !node) return
    const movingIds = expandGroups(
      selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id],
    )
    if (movingIds.length < 2) return
    const delta = { x: node.x() - table.position.x, y: node.y() - table.position.y }
    const movingSet = new Set(movingIds)
    for (const mid of movingIds) {
      if (mid === id) continue
      const t = tables.find((x) => x.id === mid)
      const n = getNode(mid)
      if (t && n) n.position({ x: t.position.x + delta.x, y: t.position.y + delta.y })
    }
    for (const g of overlayGroupsFor(movingSet)) {
      overlayRefs.current.get(g.id)?.position(delta)
    }
    node.getLayer()?.batchDraw()
  }

  const handleTableDragEnd = (id: string, center: Vec2) => {
    const table = tables.find((t) => t.id === id)
    if (!table) return
    // Expand through merged groups so a group always moves as one, even on the
    // first drag before selection state has caught up.
    const movingIds = expandGroups(
      selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id],
    )
    const movingSet = new Set(movingIds)
    // The overlay body was translated live during the drag; the store update below
    // re-renders it at absolute coordinates, so return its node to the origin.
    const resetOverlays = () =>
      overlayGroupsFor(movingSet).forEach((g) =>
        overlayRefs.current.get(g.id)?.position({ x: 0, y: 0 }),
      )
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
      resetOverlays()
      getNode(id)?.getLayer()?.batchDraw()
      return
    }

    if (movingIds.length > 1) moveTablesBy(movingIds, delta)
    else updateTable(id, { position: snapped })
    resetOverlays()
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

  // Freehand paths have no meaningful resize/rotate box — allow move + delete only.
  const selectedObstacle = obstacles.find((o) => o.id === selectedObstacleId)
  const transformableObstacleId =
    selectedObstacle && !selectedObstacle.points?.length ? selectedObstacleId : null

  // Zone focus: isolate a single zone (+ its tables and overlapping obstacles).
  const focusedZone = focusedZoneId ? zones.find((z) => z.id === focusedZoneId) : undefined
  const focusBox = focusedZone ? aabb(focusedZone.position, focusedZone.size) : null
  const visibleZones = focusedZone ? [focusedZone] : zones
  const visibleTables = focusedZone
    ? tables.filter((t) => t.zoneId === focusedZone.id)
    : tables
  const visibleObstacles =
    focusedZone && focusBox
      ? obstacles.filter((o) => overlapArea(aabb(o.position, o.size), focusBox) > 0)
      : obstacles

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      style={{
        cursor: tool === 'path' ? 'crosshair' : spaceDown ? 'grab' : 'default',
        touchAction: 'none',
      }}
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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
        {/* Path tool: disable shape hit-testing so the brush draws over anything. */}
        <Layer listening={tool !== 'path'}>
          {visibleZones.map((zone) => (
            <ZoneShape
              key={zone.id}
              zone={zone}
              colors={colors}
              selected={selectedZoneId === zone.id}
              onSelect={selectZone}
              onDragEnd={handleZoneDragEnd}
              registerNode={registerZoneNode}
            />
          ))}
          {visibleObstacles.map((obstacle) => (
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
              merged={!!table.mergedGroupId}
              selected={selectedIds.includes(table.id)}
              onSelect={handleSelectTable}
              onDragMove={handleTableDragMove}
              onDragEnd={handleTableDragEnd}
              onStartRename={startRenameTable}
              registerNode={registerNode}
            />
          ))}
          {/* Merged bodies draw on top of members (listening off) so a group reads
              as one seamless table; interaction still hits the members underneath. */}
          <MergedHulls
            groups={mergedGroups}
            tables={visibleTables}
            tableTypes={tableTypes}
            selectedIds={selectedIds}
            colors={colors}
            registerNode={registerOverlayNode}
          />
          {draftPath && draftPath.length > 0 && (
            <Line
              points={draftPath.flatMap((p) => [p.x, p.y])}
              stroke={colors.muted}
              strokeWidth={pathWidth}
              lineCap="round"
              lineJoin="round"
              opacity={0.3}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
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
            selectedId={transformableObstacleId}
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

      {focusedZone && (
        <button
          onClick={() => setFocusedZone(null)}
          className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-[var(--shadow-soft)] transition-colors hover:bg-surface-2"
        >
          <span aria-hidden>←</span>
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: focusedZone.color }}
          />
          {focusedZone.name} · Show all
        </button>
      )}

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
