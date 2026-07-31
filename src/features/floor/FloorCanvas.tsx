import { useEffect, useMemo, useRef } from 'react'
import { Layer, Stage } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useReservationStore, useUIStore } from '@/stores'
import { useContainerSize } from '@/hooks/useContainerSize'
import {
  aabb,
  overlapArea,
  seatsForTable,
  zoneDepth,
  zoneDescendantIds,
  zonesById,
} from '@/utils'
import type { Table } from '@/types'
import { GridBackground } from '@/features/editor/GridBackground'
import { ZoneShape } from '@/features/editor/ZoneShape'
import { ObstacleShape } from '@/features/editor/ObstacleShape'
import { MergedHulls } from '@/features/editor/MergedHulls'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { summarizeFloor } from '@/services/floor'
import { FloorTableNode } from './FloorTableNode'
import { FloorControls } from './FloorControls'
import { useEffectiveFloor } from './hooks/useEffectiveFloor'
import { useFloorColors } from './hooks/useFloorColors'
import { useFloorCamera, type Bounds } from './hooks/useFloorCamera'

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
 * Read-only Live Floor canvas (Phase 8, Step 2). Reuses the editor's presentational
 * shapes (grid, zones, obstacles, merged hulls) inside a `listening={false}` layer
 * so nothing is draggable, and draws each table with `FloorTableNode` colored by
 * effective status. Seating/drag interactions arrive in later steps.
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

  const { viewport, handleWheel, commitPan, fit } = useFloorCamera(stageRef)

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

  // Visible tables (effective), and their base forms for the merged hulls.
  const visibleEffective = focusedZone
    ? effective.tables.filter((et) => et.base.zoneId === focusedZone.id)
    : effective.tables
  const visibleBaseTables: Table[] = visibleEffective.map((et) => et.base)

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

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return
    const stage = stageRef.current
    if (stage) commitPan({ x: stage.x(), y: stage.y() })
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <FloorControls
        zones={zones}
        focusedZoneId={focusedZoneId}
        onFocusZone={setFocusedZone}
        summary={summary}
        onFit={() => fit(bounds, size)}
      />
      <div ref={containerRef} className="relative min-h-0 flex-1" style={{ touchAction: 'none' }}>
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
          onDragEnd={handleDragEnd}
        >
          <Layer listening={false}>
            <GridBackground
              viewport={viewport}
              stageSize={size}
              gridSize={20}
              color={colors.line}
            />
          </Layer>
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
                  merged={!!et.base.mergedGroupId}
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
              groups={mergedGroups}
              tables={visibleBaseTables}
              tableTypes={tableTypes}
              selectedIds={[]}
              colors={colors}
              registerNode={noop}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
