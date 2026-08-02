import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Stage } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useFloorStore, useReservationStore, useSettingsStore, useUIStore } from '@/stores'
import { useContainerSize } from '@/hooks/useContainerSize'
import {
  aabb,
  overlapArea,
  seatsForTable,
  zoneDepth,
  zoneDescendantIds,
  zonesById,
} from '@/utils'
import type { MergedGroup, Table } from '@/types'
import { ZoneShape } from '@/features/editor/ZoneShape'
import { ObstacleShape } from '@/features/editor/ObstacleShape'
import { MergedHulls } from '@/features/editor/MergedHulls'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { summarizeFloor } from '@/services/floor'
import { FloorTableNode } from './FloorTableNode'
import { FloorControls } from './FloorControls'
import { FloorTableMenu } from './FloorTableMenu'
import { useEffectiveFloor } from './hooks/useEffectiveFloor'
import { useFloorColors } from './hooks/useFloorColors'
import { useFloorCamera, type Bounds } from './hooks/useFloorCamera'
import { useAutoTurnover } from './hooks/useAutoTurnover'

const noop = () => {}

/** World-space union box of tables (effective positions) and zones. */
function contentBounds(
  tables: { position: { x: number; y: number }; base: Table }[],
  zones: { position: { x: number; y: number }; size: { x: number; y: number } }[],
): Bounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (box: { x: number; y: number; width: number; height: number }) => {
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.width)
    maxY = Math.max(maxY, box.y + box.height)
  }
  for (const t of tables) add(aabb(t.position, t.base.size))
  for (const z of zones) add(aabb(z.position, z.size))
  if (minX === Infinity) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Live Floor canvas (Phase 8, Steps 2-3). Reuses the editor's presentational
 * shapes (zones, obstacles, merged hulls) in a non-listening backdrop layer, and
 * draws tables with `FloorTableNode` in an interactive layer: tapping a table
 * opens its action menu (finish cleaning, block/unblock, clear). Auto-turnover
 * frees cleaning tables once their buffer elapses. Drag-to-seat arrives in Step 4.
 */
export function FloorCanvas() {
  const { ref: containerRef, size } = useContainerSize<HTMLDivElement>()
  const stageRef = useRef<Konva.Stage>(null)

  const { tableTypes, zones, obstacles, mergedGroups } = useSeatingFloor()
  const effective = useEffectiveFloor()
  const reservations = useReservationStore((s) => s.reservations)
  const colors = useFloorColors()

  const focusedZoneId = useUIStore((s) => s.focusedZoneId)
  const setFocusedZone = useUIStore((s) => s.setFocusedZone)

  const seatings = useFloorStore((s) => s.seatings)
  const setTableStatus = useFloorStore((s) => s.setTableStatus)
  const finishCleaning = useFloorStore((s) => s.finishCleaning)
  const finishAllCleaning = useFloorStore((s) => s.finishAllCleaning)
  const clearSeating = useFloorStore((s) => s.clear)
  const moveTable = useFloorStore((s) => s.moveTable)
  const moveTablesBy = useFloorStore((s) => s.moveTablesBy)
  const rotateTable = useFloorStore((s) => s.rotateTable)
  const rotateGroup = useFloorStore((s) => s.rotateGroup)
  const splitRuntime = useFloorStore((s) => s.splitRuntime)
  const restoreDefault = useFloorStore((s) => s.restoreDefault)
  const autoTurnover = useSettingsStore((s) => s.autoTurnover)
  const setAutoTurnover = useSettingsStore((s) => s.setAutoTurnover)
  useAutoTurnover()

  const { viewport, handleWheel, commitPan, fit } = useFloorCamera(stageRef)
  // A single selected table opens its action menu. (Merges come from seating, so
  // there is no manual multi-select merge.)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectTable = (id: string) => setSelectedIds([id])
  const clearSelection = () => setSelectedIds([])

  // Konva node refs so a merged group (its members + hull) tracks the cursor live.
  const nodeRefs = useRef<Map<string, Konva.Group>>(new Map())
  const hullRefs = useRef<Map<string, Konva.Group>>(new Map())
  const registerNode = useCallback((id: string, node: Konva.Group | null) => {
    if (node) nodeRefs.current.set(id, node)
    else nodeRefs.current.delete(id)
  }, [])
  const registerHull = useCallback((id: string, node: Konva.Group | null) => {
    if (node) hullRefs.current.set(id, node)
    else hullRefs.current.delete(id)
  }, [])

  const zonesIndex = useMemo(() => zonesById(zones), [zones])
  const reservationsById = useMemo(
    () => new Map(reservations.map((r) => [r.id, r])),
    [reservations],
  )
  const typeById = useMemo(() => new Map(tableTypes.map((t) => [t.id, t])), [tableTypes])

  // Zone focus: isolate one zone + its subtree (mirrors the editor's focus rules).
  const focusedZone = focusedZoneId
    ? zones.find((z) => z.id === focusedZoneId)
    : undefined
  const focusSubtree = focusedZone
    ? new Set<string>([focusedZone.id, ...zoneDescendantIds(focusedZone.id, zones)])
    : null
  const visibleZones = (focusSubtree ? zones.filter((z) => focusSubtree.has(z.id)) : zones)
    .slice()
    .sort((a, b) => zoneDepth(a, zonesIndex) - zoneDepth(b, zonesIndex))
  const focusBox = focusedZone ? aabb(focusedZone.position, focusedZone.size) : null
  const visibleObstacles =
    focusedZone && focusBox
      ? obstacles.filter((o) => overlapArea(aabb(o.position, o.size), focusBox) > 0)
      : obstacles

  // Visible tables (effective).
  const visibleEffective = focusedZone
    ? effective.tables.filter((et) => et.base.zoneId === focusedZone.id)
    : effective.tables

  // Hull inputs: tables carry their EFFECTIVE status, position and merged group
  // (runtime merge overriding base) so a seated party reads occupied and its
  // pushed-together tables draw as one body — like the editor, until cleared.
  const displayTables: Table[] = visibleEffective.map((et) => ({
    ...et.base,
    status: et.status as Table['status'],
    position: et.position,
    rotation: et.rotation,
    mergedGroupId: et.mergedGroupId,
  }))
  const hullGroups = useMemo<MergedGroup[]>(
    () => [
      ...mergedGroups,
      ...effective.runtimeMerges.map((m) => ({ id: m.id, tableIds: m.tableIds })),
    ],
    [mergedGroups, effective.runtimeMerges],
  )

  // Seated/reserved party name shown on every table it occupies (hull labels).
  const memberLabels: Record<string, string> = {}
  for (const et of visibleEffective) {
    if (!et.reservationId) continue
    if (et.status !== 'occupied' && et.status !== 'reserved') continue
    const r = reservationsById.get(et.reservationId)
    if (r) memberLabels[et.base.id] = r.guestName
  }

  const summary = useMemo(
    () => summarizeFloor(effective, tableTypes),
    [effective, tableTypes],
  )

  const bounds = useMemo(
    () => contentBounds(visibleEffective, visibleZones),
    [visibleEffective, visibleZones],
  )

  // Frame the content on first render with a real size, and again whenever the
  // focused zone changes. Not on every table/resize change — the host's manual
  // pan/zoom is preserved between those events.
  const didInitialFit = useRef(false)
  const lastFocus = useRef<string | null>(null)
  useEffect(() => {
    if (size.width <= 0 || size.height <= 0 || !bounds) return
    const focusChanged = lastFocus.current !== focusedZoneId
    if (!didInitialFit.current || focusChanged) {
      fit(bounds, size)
      didInitialFit.current = true
      lastFocus.current = focusedZoneId
    }
  }, [size, bounds, focusedZoneId, fit])

  // A single selection opens the per-table action menu (only while on screen);
  // focusing a zone clears the selection (see onFocusZone) so nothing dangles.
  const visibleIds = new Set(visibleEffective.map((et) => et.base.id))
  const single =
    selectedIds.length === 1 && visibleIds.has(selectedIds[0])
      ? effective.byId[selectedIds[0]]
      : undefined
  const selectedSeating =
    single?.status === 'occupied'
      ? seatings.find((s) => s.tableIds.includes(single.base.id))
      : undefined

  const handleStagePan = (e: KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return
    const stage = stageRef.current
    if (stage) commitPan({ x: stage.x(), y: stage.y() })
  }

  // While dragging a merged member, move its siblings + the hull body live so the
  // whole group travels as one (not a lone shadow with a lagging body).
  const handleTableDragMove = (id: string) => {
    const et = effective.byId[id]
    const node = nodeRefs.current.get(id)
    if (!et?.mergedGroupId || !node) return
    const group = hullGroups.find((g) => g.id === et.mergedGroupId)
    if (!group) return
    const delta = { x: node.x() - et.position.x, y: node.y() - et.position.y }
    for (const mid of group.tableIds) {
      if (mid === id) continue
      const n = nodeRefs.current.get(mid)
      const met = effective.byId[mid]
      if (n && met) n.position({ x: met.position.x + delta.x, y: met.position.y + delta.y })
    }
    hullRefs.current.get(group.id)?.position(delta)
    node.getLayer()?.batchDraw()
  }

  // Drag-move a table; a merged member drags its whole group as one.
  const handleTableDragEnd = (id: string, center: { x: number; y: number }) => {
    const et = effective.byId[id]
    if (!et) return
    const groupId = et.mergedGroupId
    if (groupId) {
      const group = hullGroups.find((g) => g.id === groupId)
      const delta = { x: center.x - et.position.x, y: center.y - et.position.y }
      moveTablesBy(group ? group.tableIds : [id], delta)
      // Store re-renders members at absolute coords; return the hull to origin.
      hullRefs.current.get(groupId)?.position({ x: 0, y: 0 })
    } else {
      moveTable(id, center)
    }
  }

  // Rotate a table 90°; a merged table rotates its whole group about its center.
  const rotateOne = (et: (typeof effective.tables)[number]) => {
    if (et.mergedGroupId) {
      const group = hullGroups.find((g) => g.id === et.mergedGroupId)
      rotateGroup(group ? group.tableIds : [et.base.id], 90)
    } else {
      rotateTable(et.base.id, (et.rotation + 90) % 360)
    }
  }

  // `r` rotates the selected table (or merged group) — a floor shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return
      const el = e.target
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (selectedIds.length !== 1) return
      const et = effective.byId[selectedIds[0]]
      if (!et) return
      if (et.mergedGroupId) {
        const group = hullGroups.find((g) => g.id === et.mergedGroupId)
        rotateGroup(group ? group.tableIds : [et.base.id], 90)
      } else {
        rotateTable(et.base.id, (et.rotation + 90) % 360)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, effective, hullGroups, rotateTable, rotateGroup])

  return (
    <div className="flex h-full flex-col bg-surface">
      <FloorControls
        zones={zones}
        focusedZoneId={focusedZoneId}
        onFocusZone={(id) => {
          setFocusedZone(id)
          clearSelection()
        }}
        summary={summary}
        onFit={() => fit(bounds, size)}
        onRestoreDefault={() => {
          restoreDefault()
          clearSelection()
        }}
        onFinishAllCleaning={finishAllCleaning}
        autoTurnover={autoTurnover}
        onToggleAutoTurnover={() => setAutoTurnover(!autoTurnover)}
      />
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 bg-[#ececeb] dark:bg-[#141414]"
        style={{ touchAction: 'none' }}
      >
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          scaleX={viewport.zoom}
          scaleY={viewport.zoom}
          x={viewport.pan.x}
          y={viewport.pan.y}
          draggable
          onWheel={handleWheel}
          onDragEnd={handleStagePan}
          onClick={(e) => {
            if (e.target === e.target.getStage()) clearSelection()
          }}
        >
          {/* Backdrop: zones + obstacles, never interactive. */}
          <Layer listening={false}>
            {visibleZones.map((zone) => (
              <ZoneShape
                key={zone.id}
                zone={zone}
                depth={zoneDepth(zone, zonesIndex)}
                colors={colors}
                selected={false}
                onSelect={noop}
                onDragEnd={noop}
                registerNode={noop}
              />
            ))}
            {visibleObstacles.map((obstacle) => (
              <ObstacleShape
                key={obstacle.id}
                obstacle={obstacle}
                colors={colors}
                selected={false}
                onSelect={noop}
                onDragEnd={noop}
                registerNode={noop}
              />
            ))}
          </Layer>
          {/* Tables: interactive. Hulls draw on top but stay non-listening, so
              taps fall through to the member tables underneath. */}
          <Layer>
            {visibleEffective.map((et) => {
              const type = typeById.get(et.base.typeId)
              const seats = seatsForTable(et.base, type)
              const res = et.reservationId ? reservationsById.get(et.reservationId) : undefined
              const showGuest =
                !!res && (et.status === 'occupied' || et.status === 'reserved')
              return (
                <FloorTableNode
                  key={et.base.id}
                  et={et}
                  type={type}
                  colors={colors}
                  merged={!!et.mergedGroupId}
                  selected={selectedIds.includes(et.base.id)}
                  onSelect={selectTable}
                  onDragMove={handleTableDragMove}
                  onDragEnd={handleTableDragEnd}
                  registerNode={registerNode}
                  primary={showGuest && res ? res.guestName : et.base.label}
                  secondary={
                    showGuest && res
                      ? `${res.partySize}p · ${et.base.label}`
                      : seats > 0
                        ? `${seats} seats`
                        : undefined
                  }
                />
              )
            })}
            <MergedHulls
              groups={hullGroups}
              tables={displayTables}
              tableTypes={tableTypes}
              selectedIds={[]}
              colors={colors}
              registerNode={registerHull}
              tintByStatus
              memberLabels={memberLabels}
            />
          </Layer>
        </Stage>

        {single && (
          <FloorTableMenu
            table={single}
            reservationName={
              selectedSeating
                ? reservationsById.get(selectedSeating.reservationId)?.guestName
                : undefined
            }
            canRotate
            canSplit={single.isRuntimeMerge}
            onBlock={() => {
              setTableStatus(single.base.id, 'blocked')
              clearSelection()
            }}
            onUnblock={() => {
              setTableStatus(single.base.id, undefined)
              clearSelection()
            }}
            onFinishCleaning={() => {
              finishCleaning(single.base.id)
              clearSelection()
            }}
            onClear={() => {
              if (selectedSeating) clearSeating(selectedSeating.id)
              clearSelection()
            }}
            onRotate={() => rotateOne(single)}
            onSplit={() => {
              if (single.mergedGroupId) splitRuntime(single.mergedGroupId)
              clearSelection()
            }}
            onClose={clearSelection}
          />
        )}

      </div>
    </div>
  )
}
