import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Layer, Rect, Stage } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import {
  useFloorStore,
  useFloorPlanStore,
  usePlanFloorStore,
  useLayoutStore,
  useReservationStore,
  useSettingsStore,
  useUIStore,
  isPlanning,
} from '@/stores'
import { useContainerSize } from '@/hooks/useContainerSize'
import {
  aabb,
  boundsOf,
  clamp,
  formatTime,
  groupCapacity,
  isActiveStatus,
  overlapArea,
  placementBlocked,
  pointInRect,
  screenToWorld,
  seatsForTable,
  snapPoint,
  zoneDepth,
  zoneDescendantIds,
  zonesById,
} from '@/utils'
import type { MergedGroup, Reservation, Table, Vec2 } from '@/types'
import { ZoneShape } from '@/features/editor/ZoneShape'
import { ObstacleShape } from '@/features/editor/ObstacleShape'
import { MergedHulls } from '@/features/editor/MergedHulls'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { summarizeFloor, type EffectiveTable } from '@/services/floor'
import { FloorTableNode } from './FloorTableNode'
import { FloorControls } from './FloorControls'
import { FloorTableMenu } from './FloorTableMenu'
import { RESERVATION_DRAG_MIME } from './FloorReservationRail'
import { useEffectiveFloor } from './hooks/useEffectiveFloor'
import { useFloorColors } from './hooks/useFloorColors'
import { useFloorCamera, type Bounds } from './hooks/useFloorCamera'
import { useAutoTurnover } from './hooks/useAutoTurnover'
import { usePlanMergeSync } from './hooks/usePlanMergeSync'

const noop = () => {}

// Match the floor camera's zoom bounds (useFloorCamera) for pinch-zoom.
const MIN_ZOOM = 0.2
const MAX_ZOOM = 4

interface Marquee {
  start: Vec2
  end: Vec2
}

/** World-space union box of tables (effective positions) and zones. */
function contentBounds(
  tables: { position: { x: number; y: number }; base: Table }[],
  zones: { position: { x: number; y: number }; size: { x: number; y: number } }[],
): Bounds | null {
  return boundsOf([
    ...tables.map((t) => aabb(t.position, t.base.size)),
    ...zones.map((z) => aabb(z.position, z.size)),
  ])
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
  const assignTable = useReservationStore((s) => s.assignTable)
  const clearAssignment = useReservationStore((s) => s.clearAssignment)
  const colors = useFloorColors()

  // Plan mode: the floor is a planning canvas for `viewDate` (base layout + that
  // day's assigned bookings, shown as reserved). Live-service edits — seating,
  // moving, merging, blocking, cleaning — are inert here; the host plans by
  // (re)assigning tables, which persists on the reservation.
  const planning = useFloorPlanStore(isPlanning)
  const viewDate = useFloorPlanStore((s) => s.viewDate)
  const stepDay = useFloorPlanStore((s) => s.stepDay)
  const setViewDate = useFloorPlanStore((s) => s.setViewDate)
  const goToday = useFloorPlanStore((s) => s.goToday)
  const togglePlanMode = useFloorPlanStore((s) => s.togglePlanMode)

  // Per-day plan arrangement actions (used only while planning).
  const movePlanTable = usePlanFloorStore((s) => s.movePlanTable)
  const movePlanTablesBy = usePlanFloorStore((s) => s.movePlanTablesBy)
  const rotatePlanTable = usePlanFloorStore((s) => s.rotatePlanTable)
  const rotatePlanGroup = usePlanFloorStore((s) => s.rotatePlanGroup)
  const mergePlan = usePlanFloorStore((s) => s.mergePlan)
  const splitPlan = usePlanFloorStore((s) => s.splitPlan)
  const resetPlanDay = usePlanFloorStore((s) => s.resetPlanDay)

  const focusedZoneId = useUIStore((s) => s.focusedZoneId)
  const setFocusedZone = useUIStore((s) => s.setFocusedZone)

  const seatings = useFloorStore((s) => s.seatings)
  const seatReservation = useFloorStore((s) => s.seat)
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
  const undo = useFloorStore((s) => s.undo)
  const redo = useFloorStore((s) => s.redo)
  const canUndo = useFloorStore((s) => s.past.length > 0)
  const canRedo = useFloorStore((s) => s.future.length > 0)
  const storeTables = useLayoutStore((s) => s.storeTables)
  const autoTurnover = useSettingsStore((s) => s.autoTurnover)
  const setAutoTurnover = useSettingsStore((s) => s.setAutoTurnover)
  const turnoverBufferMin = useSettingsStore((s) => s.seating.turnoverBufferMin)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const gridSize = useSettingsStore((s) => s.gridSize)
  useAutoTurnover()
  usePlanMergeSync()

  // Arrangement dispatchers: while planning, edits route to the plan day's own
  // arrangement (`planFloorStore`, keyed by `viewDate`) so they never touch the
  // live shift; otherwise they hit the live `floorStore`. Same signatures either
  // way, so the handlers below are agnostic.
  const moveTableD = useCallback(
    (id: string, pos: Vec2) =>
      planning ? movePlanTable(viewDate, id, pos) : moveTable(id, pos),
    [planning, viewDate, movePlanTable, moveTable],
  )
  const moveTablesByD = useCallback(
    (ids: string[], delta: Vec2) =>
      planning ? movePlanTablesBy(viewDate, ids, delta) : moveTablesBy(ids, delta),
    [planning, viewDate, movePlanTablesBy, moveTablesBy],
  )
  const rotateTableD = useCallback(
    (id: string, rot: number) =>
      planning ? rotatePlanTable(viewDate, id, rot) : rotateTable(id, rot),
    [planning, viewDate, rotatePlanTable, rotateTable],
  )
  const rotateGroupD = useCallback(
    (ids: string[], deg: number) =>
      planning ? rotatePlanGroup(viewDate, ids, deg) : rotateGroup(ids, deg),
    [planning, viewDate, rotatePlanGroup, rotateGroup],
  )
  const splitRuntimeD = useCallback(
    (id: string) => (planning ? splitPlan(viewDate, id) : splitRuntime(id)),
    [planning, viewDate, splitPlan, splitRuntime],
  )

  const { viewport, handleWheel, commitPan, setCamera, fit, setFrame, dragBound } =
    useFloorCamera(stageRef)
  // Selection drives the per-table action menu (when one is selected) and manual
  // merge (when several are). Shift-click adds; `selectTable` is defined below,
  // once merged-group membership (`hullGroups`) is known.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const clearSelection = useCallback(() => setSelectedIds([]), [])

  // Marquee box-select (mouse + one-finger touch), Space-to-pan, and pinch-zoom —
  // the same interaction model as the editor, so multi-select + merge work on a
  // touchscreen without a keyboard.
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const lastPinchDist = useRef(0)
  const lastPinchCenter = useRef<Vec2 | null>(null)

  // Transient top-center notice — a merge that couldn't be auto-placed, or a
  // rejected reservation drop (not available / not enough seats).
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
  const visibleZones = (
    focusSubtree ? zones.filter((z) => focusSubtree.has(z.id)) : zones
  )
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

  // Tables just dropped by a drag: they're already at the target, so their glide
  // is suppressed for that one commit. The glide hook consumes (deletes) each id
  // when it runs, so this needs no separate clear.
  const dragIds = useRef<Set<string>>(new Set())

  // Frame the content on first render with a real size, and again whenever the
  // focused zone changes. Not on every table/resize change — the host's manual
  // pan/zoom is preserved between those events.
  const didInitialFit = useRef(false)
  const lastFocus = useRef<string | null>(null)
  // Keep the camera's pan-bounds in sync with the visible content + stage size.
  useEffect(() => setFrame(bounds, size), [bounds, size, setFrame])
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
    return hullGroups.find(
      (g) => g.tableIds.length === sel.size && g.tableIds.every((i) => sel.has(i)),
    )
  }, [selectedIds, hullGroups])
  // Only a runtime merge can be split (base layout merges are fixed). In plan mode
  // an auto-merge (`auto-*`, derived from a multi-table booking) is not a real
  // stored merge — it's undone by unplanning the booking, not by Split.
  const selectedRuntimeMerge = selectedGroup
    ? effective.runtimeMerges.find(
        (m) => m.id === selectedGroup.id && !m.id.startsWith('auto-'),
      )
    : undefined
  // Merge is offered for 2+ tables that aren't already one existing group.
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
    const isRound = (et: EffectiveTable) =>
      typeById.get(et.base.typeId)?.shape === 'round'
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
  const menuRes = menuSeating
    ? reservationsById.get(menuSeating.reservationId)
    : undefined

  // Plan mode: the booking planned on the selected table (its `reserved` holder),
  // with a simple time/party detail card and an unplan action.
  const menuPlanRes =
    planning && menuTable?.reservationId
      ? reservationsById.get(menuTable.reservationId)
      : undefined
  const planOccupancy = useMemo(() => {
    if (!menuPlanRes) return undefined
    const start = Date.parse(menuPlanRes.dateTime)
    const end = start + menuPlanRes.estimatedDuration * 60_000
    return {
      timeRange: `${formatTime(menuPlanRes.dateTime)} – ${formatTime(new Date(end).toISOString())}`,
      partySize: menuPlanRes.partySize,
    }
  }, [menuPlanRes])

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

  // Marquee box-select. Shared by mouse and one-finger touch: start on empty
  // canvas, grow while dragging, and on release select every table whose center
  // falls inside (expanded to whole merged groups). A tiny box is a plain tap →
  // clear the selection.
  const startMarquee = () => {
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    const world = screenToWorld(pointer, viewport)
    setMarquee({ start: world, end: world })
  }
  const moveMarquee = () => {
    if (!marquee) return
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    setMarquee({ ...marquee, end: screenToWorld(pointer, viewport) })
  }
  const endMarquee = (additive: boolean) => {
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
    const hits = visibleEffective
      .filter((et) => pointInRect(et.position, rect))
      .flatMap((et) => expandGroups(et.base.id))
    setSelectedIds(additive ? [...new Set([...selectedIds, ...hits])] : [...new Set(hits)])
  }

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (spaceDown) return
    if (e.target !== e.target.getStage()) return
    startMarquee()
  }
  const handleStageMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    if (marquee) endMarquee(e.evt.shiftKey)
  }

  // Touch: one finger on empty canvas marquee-selects; two fingers pinch-zoom and
  // pan by the midpoint's travel (mirrors the editor). Space isn't available on a
  // touchscreen, so panning lives on the second finger.
  const handleTouchStart = (e: KonvaEventObject<TouchEvent>) => {
    const stage = stageRef.current
    if (!stage) return
    if (e.evt.touches.length >= 2) {
      setMarquee(null)
      stage.draggable(false)
      return
    }
    if (e.target === stage && !spaceDown) startMarquee()
  }
  const handleTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const stage = stageRef.current
    const touches = e.evt.touches
    if (!stage) return
    if (touches.length < 2) {
      if (marquee) {
        e.evt.preventDefault()
        moveMarquee()
      }
      return
    }
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
    const newZoom = clamp(viewport.zoom * (dist / lastPinchDist.current), MIN_ZOOM, MAX_ZOOM)
    const world = screenToWorld(center, viewport)
    const pan = {
      x: center.x - world.x * newZoom + (center.x - lastPinchCenter.current.x),
      y: center.y - world.y * newZoom + (center.y - lastPinchCenter.current.y),
    }
    setCamera({ zoom: newZoom, pan })
    lastPinchDist.current = dist
    lastPinchCenter.current = center
  }
  const handleTouchEnd = () => {
    if (marquee) endMarquee(false)
    lastPinchDist.current = 0
    lastPinchCenter.current = null
    stageRef.current?.draggable(spaceDown)
  }

  // Real seat count for a candidate drop target: a single table's capacity, or
  // a merge's (honoring a manual `MergedGroup.seats` override when the target IS
  // an existing group — same number the hull badge shows), never a naive sum.
  const capacityOfTarget = useCallback(
    (ids: string[]): number => {
      const members = ids
        .map((id) => effective.byId[id]?.base)
        .filter((t): t is Table => !!t)
      if (members.length <= 1) {
        const et = ids[0] ? effective.byId[ids[0]] : undefined
        return et ? seatsForTable(et.base, typeById.get(et.base.typeId)) : 0
      }
      const group = hullGroups.find(
        (g) =>
          g.tableIds.length === ids.length && ids.every((id) => g.tableIds.includes(id)),
      )
      return groupCapacity(members, tableTypes, group)
    },
    [effective, typeById, hullGroups, tableTypes],
  )

  /**
   * Drop a reservation card (dragged from the rail) onto the floor — a manual
   * seat that bypasses the suggestion engine entirely. Target tables: whatever
   * is currently selected (so the host can hand-pick an arbitrary combo the
   * engine's proximity-bounded merge search doesn't find), or, with nothing
   * selected, whichever single table (or its existing merged group) sits under
   * the drop point. Refuses — with a toast, never a silent no-op — if any target
   * isn't `available`, or if the target's real capacity is short of the party
   * (dropping a party of 9 onto a 7-seat merge must not quietly under-seat them).
   */
  const handleReservationDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const reservationId = e.dataTransfer.getData(RESERVATION_DRAG_MIME)
    if (!reservationId) return
    const reservation = reservationsById.get(reservationId)
    if (!reservation) return

    let targetIds = selectedIds
    if (targetIds.length === 0) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const world = screenToWorld(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        viewport,
      )
      const hit = visibleEffective.find((et) =>
        pointInRect(world, aabb(et.position, et.base.size)),
      )
      if (!hit) return
      targetIds = expandGroups(hit.base.id)
    }

    // A target must be free to seat THIS party. A table can read `available`
    // while still holding a further-out booking (`upcomingReservationId`), and a
    // `reserved` table may be reserved for this very party or for another one — so
    // check the actual holder, not just the visual status. Without this, seating a
    // party over a table another overlapping booking holds would silently steal it
    // (e.g. a party of 9 dropped on 141+41+42 grabbing 141's manual reservation).
    const bStart = Date.parse(reservation.dateTime)
    const bEnd = bStart + reservation.estimatedDuration * 60_000
    const buffer = turnoverBufferMin * 60_000
    for (const id of targetIds) {
      const et = effective.byId[id]
      if (!et) return
      // Physically unusable right now — someone seated, blocked, or mid-turnover.
      if (et.status === 'occupied' || et.status === 'blocked' || et.status === 'cleaning') {
        flashNotice('One of those tables isn’t free.')
        return
      }
      // Held — reserved now, or free-but-booked-later — by ANOTHER active booking
      // whose window overlaps this party. Seating here would steal their table.
      const holderId = et.reservationId ?? et.upcomingReservationId
      if (holderId && holderId !== reservationId) {
        const holder = reservationsById.get(holderId)
        if (holder && isActiveStatus(holder.status)) {
          const hStart = Date.parse(holder.dateTime)
          const hEnd = hStart + holder.estimatedDuration * 60_000
          if (bStart < hEnd + buffer && hStart < bEnd + buffer) {
            flashNotice(
              `Table ${et.base.label} is reserved for ${holder.guestName} (${formatTime(holder.dateTime)}).`,
            )
            return
          }
        }
      }
    }

    const capacity = capacityOfTarget(targetIds)
    if (capacity < reservation.partySize) {
      flashNotice(
        `Party of ${reservation.partySize} needs ${reservation.partySize} seats — that's only ${capacity}.`,
      )
      return
    }

    // Plan mode: don't seat — pin the tables to the booking (assign). The plan
    // persists on the reservation and drives live service when the day comes.
    if (planning) {
      assignTable(reservationId, targetIds, 'manual')
      const label = targetIds
        .map((id) => effective.byId[id]?.base.label ?? id)
        .join(' + ')
      flashNotice(`Planned ${reservation.guestName} at ${label}`)
      clearSelection()
      return
    }

    // Drag-to-seat keeps the tables exactly where the host dropped them —
    // `arrange: false` so a multi-table seat never re-lays-out / moves them.
    seatReservation(reservationId, targetIds, false)
    clearSelection()
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
      if (n && met)
        n.position({ x: met.position.x + delta.x, y: met.position.y + delta.y })
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
        mid === id
          ? snapped
          : { x: met.position.x + delta.x, y: met.position.y + delta.y }
      return placementBlocked(
        newCenter,
        met.base.size,
        movingSet,
        ctx,
        clearanceOf(met.base),
      )
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

    // These tables are already at the dropped spot — suppress their glide so they
    // don't jump back and re-slide when the store commit re-renders.
    dragIds.current = new Set(movingIds)
    if (group) {
      moveTablesByD(group.tableIds, delta)
      // Store re-renders members at absolute coords; return the hull to origin.
      hullRefs.current.get(groupId!)?.position({ x: 0, y: 0 })
    } else {
      moveTableD(id, snapped)
    }
  }

  // Rotate a table 90°; a merged table rotates its whole group about its center.
  const rotateOne = useCallback(
    (et: EffectiveTable) => {
      if (et.mergedGroupId) {
        const group = hullGroups.find((g) => g.id === et.mergedGroupId)
        rotateGroupD(group ? group.tableIds : [et.base.id], 90)
      } else {
        rotateTableD(et.base.id, (et.rotation + 90) % 360)
      }
    },
    [hullGroups, rotateGroupD, rotateTableD],
  )

  // Merge the current selection, then tell the host if the block couldn't be
  // auto-placed (no clear spot) so they know to drag the tables together.
  const mergeSelection = useCallback(() => {
    const ids = selectedIds
    const key = [...ids].sort().join('+')
    if (planning) {
      mergePlan(viewDate, ids)
      const created = usePlanFloorStore
        .getState()
        .byDay[viewDate]?.merges.find((m) => [...m.tableIds].sort().join('+') === key)
      if (created?.needsArrange)
        flashNotice('Merged — drag the tables together to arrange')
      clearSelection()
      return
    }
    mergeTables(ids)
    const created = useFloorStore
      .getState()
      .runtimeMerges.find((m) => [...m.tableIds].sort().join('+') === key)
    if (created?.needsArrange) flashNotice('Merged — drag the tables together to arrange')
    clearSelection()
  }, [selectedIds, planning, viewDate, mergePlan, mergeTables, flashNotice, clearSelection])

  // Toolbar actions over the current selection (also reachable via keyboard).
  const rotateSelection = useCallback(() => {
    if (selectedGroup) {
      rotateGroupD(selectedGroup.tableIds, 90)
      return
    }
    if (selectedIds.length === 1) {
      const et = effective.byId[selectedIds[0]]
      if (et) rotateOne(et)
    }
  }, [selectedGroup, selectedIds, effective, rotateGroupD, rotateOne])
  const canRotate = !!selectedGroup || selectedIds.length === 1
  const splitSelection = useCallback(() => {
    if (!selectedRuntimeMerge) return
    splitRuntimeD(selectedRuntimeMerge.id)
    clearSelection()
  }, [selectedRuntimeMerge, splitRuntimeD, clearSelection])

  // Space toggles pan mode (like the editor); the stage becomes draggable while
  // held so a drag pans instead of drawing a marquee.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) setSpaceDown(true)
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

  // Undo/redo of manual floor edits — ⌘/Ctrl+Z, and ⇧⌘Z / Ctrl+Y to redo.
  // Inert while planning (there's no live edit to undo on a plan canvas).
  useEffect(() => {
    if (planning) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const el = e.target
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      const key = e.key.toLowerCase()
      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, planning])

  // `r` rotates the selected table (or merged group) — a floor shortcut. Routes
  // to the plan day's arrangement while planning, the live shift otherwise.
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
        rotateGroupD(group ? group.tableIds : [et.base.id], 90)
      } else {
        rotateTableD(et.base.id, (et.rotation + 90) % 360)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, effective, hullGroups, rotateTableD, rotateGroupD])

  // `m` merges the selection, or splits it when it's exactly one splittable runtime
  // merge — mirrors the editor's merge shortcut, over the active arrangement layer
  // (plan day while planning, live shift otherwise).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'm' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (selectedRuntimeMerge) {
        e.preventDefault()
        splitRuntimeD(selectedRuntimeMerge.id)
        clearSelection()
      } else if (canMerge) {
        e.preventDefault()
        mergeSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedRuntimeMerge, canMerge, mergeSelection, splitRuntimeD, clearSelection])

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
          if (planning) resetPlanDay(viewDate)
          else restoreDefault()
          clearSelection()
        }}
        onFinishAllCleaning={finishAllCleaning}
        autoTurnover={autoTurnover}
        onToggleAutoTurnover={() => setAutoTurnover(!autoTurnover)}
        onMerge={mergeSelection}
        canMerge={canMerge}
        onSplit={splitSelection}
        canSplit={!!selectedRuntimeMerge}
        onRotate={rotateSelection}
        canRotate={canRotate}
        onUndo={undo}
        canUndo={canUndo}
        onRedo={redo}
        canRedo={canRedo}
        viewDate={viewDate}
        planning={planning}
        onStepDay={stepDay}
        onPickDate={setViewDate}
        onGoToday={goToday}
        onTogglePlan={togglePlanMode}
      />
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 bg-[#ececeb] dark:bg-[#0d1013]"
        style={{ touchAction: 'none', cursor: spaceDown ? 'grab' : 'default' }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }}
        onDrop={handleReservationDrop}
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
          dragBoundFunc={dragBound}
          onWheel={handleWheel}
          onDragEnd={handleStagePan}
          onMouseDown={handleStageMouseDown}
          onMouseMove={moveMarquee}
          onMouseUp={handleStageMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
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
              const res = et.reservationId
                ? reservationsById.get(et.reservationId)
                : undefined
              const showGuest =
                !!res && (et.status === 'occupied' || et.status === 'reserved')
              const upcoming = et.upcomingReservationId
                ? reservationsById.get(et.upcomingReservationId)
                : undefined
              return (
                <FloorTableNode
                  key={et.base.id}
                  et={et}
                  type={type}
                  colors={colors}
                  merged={!!et.mergedGroupId}
                  selected={selectedIds.includes(et.base.id)}
                  dragIds={dragIds}
                  onSelect={selectTable}
                  onDragMove={handleTableDragMove}
                  onDragEnd={handleTableDragEnd}
                  registerNode={registerNode}
                  primary={showGuest && res ? res.guestName : et.base.label || '?'}
                  secondary={
                    showGuest && res
                      ? `${res.partySize}p · ${et.base.label || '?'}`
                      : upcoming
                        ? `Free · ${formatTime(upcoming.dateTime)} booked`
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
          </Layer>
        </Stage>

        {menuTable && menuOnScreen && (
          <FloorTableMenu
            table={menuTable}
            reservationName={planning ? menuPlanRes?.guestName : menuRes?.guestName}
            tablesLabel={menuMembers.length > 1 ? menuLabel : undefined}
            occupancy={planning ? planOccupancy : occupancy}
            canStore={menuMembers.every((et) => et.status === 'available')}
            planMode={planning}
            onUnassign={
              menuPlanRes
                ? () => {
                    clearAssignment(menuPlanRes.id)
                    clearSelection()
                  }
                : undefined
            }
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
            onStore={() => {
              storeTables(menuMembers.map((et) => et.base.id))
              clearSelection()
            }}
            onClose={clearSelection}
          />
        )}

        {canMerge && (
          <motion.div
            initial={{ opacity: 0, y: 8, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute bottom-4 left-1/2 flex items-center gap-2 rounded-full border border-line bg-surface px-2 py-1.5 shadow-lg"
          >
            <span className="pl-1.5 text-xs text-muted">
              {selectedIds.length} selected
            </span>
            <button
              className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-surface transition-opacity hover:opacity-90"
              onClick={mergeSelection}
            >
              Merge
            </button>
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
              M
            </kbd>
          </motion.div>
        )}

        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -4, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-none absolute left-1/2 top-4 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-lg"
          >
            {notice}
          </motion.div>
        )}
      </div>
    </div>
  )
}
