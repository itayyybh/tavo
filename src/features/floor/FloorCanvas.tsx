import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Stage } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useFloorStore, useReservationStore, useSettingsStore, useUIStore } from '@/stores'
import { useContainerSize } from '@/hooks/useContainerSize'
import {
  aabb,
  formatTime,
  overlapArea,
  placementBlocked,
  seatsForTable,
  snapPoint,
  zoneDepth,
  zoneDescendantIds,
  zonesById,
} from '@/utils'
import type { MergedGroup, Reservation, Table } from '@/types'
import { ZoneShape } from '@/features/editor/ZoneShape'
import { ObstacleShape } from '@/features/editor/ObstacleShape'
import { MergedHulls } from '@/features/editor/MergedHulls'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { summarizeFloor, type EffectiveTable } from '@/services/floor'
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
 * Live Floor canvas (Phase 8, Steps 2-4). Reuses the editor's presentational
 * shapes (zones, obstacles, merged hulls) in a non-listening backdrop layer, and
 * draws tables with `FloorTableNode` in an interactive layer: tapping a table
 * opens its action menu (finish cleaning, block/unblock, clear). Manual floor
 * management (Step 4d), mirroring the editor: drag to reposition (grid-snapped,
 * collision-reverted via the shared `placementBlocked` gate), shift-click to
 * multi-select, and `m` / the Merge control to merge the selection or split a
 * runtime merge. Auto-turnover frees cleaning tables once their buffer elapses.
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
  const mergeTables = useFloorStore((s) => s.mergeTables)
  const splitRuntime = useFloorStore((s) => s.splitRuntime)
  const restoreDefault = useFloorStore((s) => s.restoreDefault)
  const autoTurnover = useSettingsStore((s) => s.autoTurnover)
  const setAutoTurnover = useSettingsStore((s) => s.setAutoTurnover)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const gridSize = useSettingsStore((s) => s.gridSize)
  useAutoTurnover()

  const { viewport, handleWheel, commitPan, fit } = useFloorCamera(stageRef)
  // Selection drives the per-table action menu (when one is selected) and manual
  // merge (when several are). Shift-click adds; `selectTable` is defined below,
  // once merged-group membership (`hullGroups`) is known.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const clearSelection = useCallback(() => setSelectedIds([]), [])

  // Transient top-center notice (e.g. a merge that couldn't be auto-placed).
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | null>(null)
  const flashNotice = useCallback((msg: string) => {
    setNotice(msg)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2200)
  }, [])
  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    },
    [],
  )

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

  // Effective tables as plain Table[] for drag collision — ALL zones (so a drag
  // can't land on a table hidden by zone focus), at their runtime positions.
  const allTables = useMemo<Table[]>(
    () =>
      effective.tables.map((et) => ({
        ...et.base,
        position: et.position,
        rotation: et.rotation,
        mergedGroupId: et.mergedGroupId,
      })),
    [effective.tables],
  )
  const clearanceOf = useCallback(
    (t: Table) => typeById.get(t.typeId)?.clearance ?? 0,
    [typeById],
  )

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

  // A merged table behaves as one unit: expand any member id to its whole group.
  const expandGroups = useCallback(
    (id: string) => hullGroups.find((g) => g.tableIds.includes(id))?.tableIds ?? [id],
    [hullGroups],
  )

  // Select a table (and its whole merged group). Shift-click toggles that group in
  // the current selection; a plain click replaces it.
  const selectTable = useCallback(
    (id: string, additive: boolean) => {
      const ids = expandGroups(id)
      setSelectedIds((prev) => {
        if (!additive) return ids
        const allIn = ids.every((i) => prev.includes(i))
        return allIn
          ? prev.filter((i) => !ids.includes(i))
          : [...new Set([...prev, ...ids])]
      })
    },
    [expandGroups],
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

  // Merged-hull bodies are translated imperatively to track a live group drag.
  // Once any move/merge/split commits to the store, snap every hull back to the
  // origin so it re-renders from its members' absolute coordinates — mirrors the
  // editor's overlay reset, so a split/drag can never leave a stray hull box.
  useEffect(() => {
    hullRefs.current.forEach((node) => node.position({ x: 0, y: 0 }))
  }, [effective.tables, effective.runtimeMerges])

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

  // The merged group the selection exactly covers, if any — a merged table is one
  // entity, so selecting all its members opens its card (not the merge pill).
  const selectedGroup = useMemo(() => {
    if (selectedIds.length < 2) return undefined
    const sel = new Set(selectedIds)
    return hullGroups.find((g) => g.tableIds.length === sel.size && g.tableIds.every((i) => sel.has(i)))
  }, [selectedIds, hullGroups])
  // Only a runtime merge can be split on the floor (base layout merges are fixed).
  const selectedRuntimeMerge = selectedGroup
    ? effective.runtimeMerges.find((m) => m.id === selectedGroup.id)
    : undefined
  // Merge is offered only for 2+ tables that aren't already one existing group.
  const canMerge = selectedIds.length >= 2 && !selectedGroup

  // The action card opens for one selected table OR one fully-selected merged
  // group (a merged table is one entity). Members are ordered round-first so the
  // label reads round + rect + rect…; the first is the card's representative.
  const visibleIds = new Set(visibleEffective.map((et) => et.base.id))
  const menuMembers = useMemo(() => {
    const ids = selectedGroup
      ? selectedGroup.tableIds
      : selectedIds.length === 1
        ? selectedIds
        : []
    const isRound = (et: EffectiveTable) => typeById.get(et.base.typeId)?.shape === 'round'
    const members = ids
      .map((id) => effective.byId[id])
      .filter((et): et is EffectiveTable => !!et)
    return [...members.filter(isRound), ...members.filter((et) => !isRound(et))]
  }, [selectedGroup, selectedIds, effective.byId, typeById])
  const menuTable = menuMembers[0]
  const menuOnScreen = menuMembers.some((et) => visibleIds.has(et.base.id))
  const menuLabel = menuMembers.map((et) => et.base.label).join(' + ')
  const menuSeating =
    menuTable?.status === 'occupied'
      ? seatings.find((s) => menuMembers.some((et) => s.tableIds.includes(et.base.id)))
      : undefined
  const menuRes = menuSeating ? reservationsById.get(menuSeating.reservationId) : undefined

  // Occupied-card details: the party's time window, size, and the next booking
  // assigned to any of these tables (who's coming and when).
  const occupancy = useMemo(() => {
    if (!menuRes) return undefined
    const start = Date.parse(menuRes.dateTime)
    const end = start + menuRes.estimatedDuration * 60_000
    const memberSet = new Set(menuMembers.map((et) => et.base.id))
    const upcoming: Reservation['status'][] = ['pending', 'confirmed', 'arrived']
    const next = reservations
      .filter(
        (r) =>
          r.id !== menuRes.id &&
          upcoming.includes(r.status) &&
          Date.parse(r.dateTime) >= end &&
          (r.assignedTableIds ?? []).some((id) => memberSet.has(id)),
      )
      .sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime))[0]
    return {
      timeRange: `${formatTime(menuRes.dateTime)} – ${formatTime(new Date(end).toISOString())}`,
      partySize: menuRes.partySize,
      next: next ? { name: next.guestName, time: formatTime(next.dateTime) } : undefined,
    }
  }, [menuRes, reservations, menuMembers])

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

  // Drag-move a table; a merged member drags its whole group as one. Snaps to the
  // grid and reverts if any moved table would overlap another table/wall/foreign
  // zone — the same placement gate the editor drag uses (`placementBlocked`).
  const handleTableDragEnd = (id: string, center: { x: number; y: number }) => {
    const et = effective.byId[id]
    if (!et) return
    const groupId = et.mergedGroupId
    const group = groupId ? hullGroups.find((g) => g.id === groupId) : undefined
    const movingIds = group ? group.tableIds : [id]
    const movingSet = new Set(movingIds)
    const snapped = snapToGrid ? snapPoint(center, gridSize) : center
    const delta = { x: snapped.x - et.position.x, y: snapped.y - et.position.y }

    const ctx = {
      tables: allTables.filter((t) => !movingSet.has(t.id)),
      obstacles,
      zones,
      zonesIndex,
      clearanceOf,
    }
    const blocked = movingIds.some((mid) => {
      const met = effective.byId[mid]
      if (!met) return false
      const newCenter =
        mid === id ? snapped : { x: met.position.x + delta.x, y: met.position.y + delta.y }
      return placementBlocked(newCenter, met.base.size, movingSet, ctx, clearanceOf(met.base))
    })

    if (blocked) {
      // Snap every moved node back to its stored effective position.
      movingIds.forEach((mid) => {
        const met = effective.byId[mid]
        const n = nodeRefs.current.get(mid)
        if (met && n) n.position({ x: met.position.x, y: met.position.y })
      })
      if (groupId) hullRefs.current.get(groupId)?.position({ x: 0, y: 0 })
      nodeRefs.current.get(id)?.getLayer()?.batchDraw()
      return
    }

    if (group) {
      moveTablesBy(group.tableIds, delta)
      // Store re-renders members at absolute coords; return the hull to origin.
      hullRefs.current.get(groupId!)?.position({ x: 0, y: 0 })
    } else {
      moveTable(id, snapped)
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

  // Merge the current selection, then tell the host if the block couldn't be
  // auto-placed (no clear spot) so they know to drag the tables together.
  const mergeSelection = useCallback(() => {
    const ids = selectedIds
    mergeTables(ids)
    const key = [...ids].sort().join('+')
    const created = useFloorStore
      .getState()
      .runtimeMerges.find((m) => [...m.tableIds].sort().join('+') === key)
    if (created?.needsArrange) flashNotice('Merged — drag the tables together to arrange')
    clearSelection()
  }, [selectedIds, mergeTables, flashNotice, clearSelection])

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

  // `m` merges the selection, or splits it when it's exactly one runtime merge —
  // mirrors the editor's merge shortcut, over the floor's runtime override layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'm' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (selectedRuntimeMerge) {
        e.preventDefault()
        splitRuntime(selectedRuntimeMerge.id)
        clearSelection()
      } else if (canMerge) {
        e.preventDefault()
        mergeSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedRuntimeMerge, canMerge, mergeSelection, splitRuntime, clearSelection])

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

        {menuTable && menuOnScreen && (
          <FloorTableMenu
            table={menuTable}
            reservationName={menuRes?.guestName}
            tablesLabel={menuMembers.length > 1 ? menuLabel : undefined}
            occupancy={occupancy}
            canRotate
            canSplit={!!selectedRuntimeMerge}
            onBlock={() => {
              setTableStatus(menuTable.base.id, 'blocked')
              clearSelection()
            }}
            onUnblock={() => {
              setTableStatus(menuTable.base.id, undefined)
              clearSelection()
            }}
            onFinishCleaning={() => {
              finishCleaning(menuTable.base.id)
              clearSelection()
            }}
            onClear={() => {
              if (menuSeating) clearSeating(menuSeating.id)
              clearSelection()
            }}
            onRotate={() => rotateOne(menuTable)}
            onSplit={() => {
              if (selectedRuntimeMerge) splitRuntime(selectedRuntimeMerge.id)
              clearSelection()
            }}
            onClose={clearSelection}
          />
        )}

        {canMerge && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface px-2 py-1.5 shadow-lg">
            <span className="pl-1.5 text-xs text-muted">{selectedIds.length} selected</span>
            <button
              className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-surface transition-opacity hover:opacity-90"
              onClick={mergeSelection}
            >
              Merge
            </button>
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">M</kbd>
          </div>
        )}

        {notice && (
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-lg">
            {notice}
          </div>
        )}
      </div>
    </div>
  )
}
