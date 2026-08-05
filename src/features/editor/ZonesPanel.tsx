import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Zone } from '@/types'
import { Button } from '@/components/ui'
import { useLayoutStore, useSettingsStore, useUIStore } from '@/stores'
import { clamp, cn, screenToWorld, snapPoint } from '@/utils'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
// Padding around a focused zone, in grid squares, on each side.
const FOCUS_PADDING_SQUARES = 5

// Native HTML5 drag-and-drop doesn't exist on iOS Safari, so zone reordering
// is pointer-based: a mouse drag starts as soon as it moves past a small
// threshold; a touch drag needs a brief hold first so a normal list scroll
// isn't hijacked into a drag.
const DRAG_MOVE_THRESHOLD = 6
const TOUCH_SCROLL_CANCEL_THRESHOLD = 10
const TOUCH_LONG_PRESS_MS = 300

interface ZonesPanelProps {
  /** Called after an action that should dismiss the mobile drawer (e.g. focus). */
  onClosePanel?: () => void
}

/** Sidebar for managing zones (nested folder tree) and assigning selected tables. */
export function ZonesPanel({ onClosePanel }: ZonesPanelProps) {
  const { t } = useTranslation('editor')
  const zones = useLayoutStore((s) => s.zones)
  const tables = useLayoutStore((s) => s.tables)
  const addZone = useLayoutStore((s) => s.addZone)
  const updateZone = useLayoutStore((s) => s.updateZone)
  const removeZone = useLayoutStore((s) => s.removeZone)
  const nestZoneInto = useLayoutStore((s) => s.nestZoneInto)
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
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId) inputRef.current?.select()
  }, [renamingId])

  const countFor = (zoneId: string) => tables.filter((t) => t.zoneId === zoneId).length
  const unassigned = tables.filter((t) => !t.zoneId).length
  const selectedCount = selectedTableIds.length
  const selectedZone = zones.find((z) => z.id === selectedZoneId)

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
    startRename(id, t('zones.defaultName', { n: zones.length + 1 }))
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

  // Cancels whichever pointer-drag gesture is in flight, if any (unmount safety).
  const dragCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanupRef.current?.(), [])

  // Finds the zone row (or the list background, for "unnest") under a point.
  const findDropTarget = (x: number, y: number, draggedId: string) => {
    const el = document.elementFromPoint(x, y)
    const row = el?.closest<HTMLElement>('[data-zone-row-id]')
    if (row) return row.dataset.zoneRowId !== draggedId ? (row.dataset.zoneRowId ?? null) : null
    return el?.closest('[data-zone-list]') ? '__root__' : null
  }

  // Starts a pointer-based drag on a zone row. Mouse drags begin on the first
  // real move; touch drags need a short hold first so a plain scroll swipe
  // isn't stolen into a drag.
  const beginRowDrag = (zone: Zone) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (renamingId === zone.id) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input')) return

    const pointerId = e.pointerId
    const startX = e.clientX
    const startY = e.clientY
    const isTouch = e.pointerType !== 'mouse'
    let dragStarted = false
    let longPressTimer: number | null = null

    const start = () => {
      dragStarted = true
      setDragId(zone.id)
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY)
      if (!dragStarted) {
        if (!isTouch && dist > DRAG_MOVE_THRESHOLD) start()
        else if (isTouch && dist > TOUCH_SCROLL_CANCEL_THRESHOLD) finish()
        return
      }
      ev.preventDefault()
      setDropTargetId(findDropTarget(ev.clientX, ev.clientY, zone.id))
    }

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      if (dragStarted) {
        const target = findDropTarget(ev.clientX, ev.clientY, zone.id)
        if (target === '__root__') nestZoneInto(zone.id, null)
        else if (target) nestZoneInto(zone.id, target)
      }
      finish()
    }

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish()
    }

    function finish() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (longPressTimer) window.clearTimeout(longPressTimer)
      setDragId(null)
      setDropTargetId(null)
      dragCleanupRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    dragCleanupRef.current = finish
    if (isTouch) longPressTimer = window.setTimeout(start, TOUCH_LONG_PRESS_MS)
  }

  // Root zones, then a recursive render so children sit indented under parents.
  // A zone whose parent no longer exists is treated as a root (never orphaned).
  const zoneIds = new Set(zones.map((z) => z.id))
  const rootZones = zones.filter((z) => !z.parentId || !zoneIds.has(z.parentId))
  const childrenOf = (parentId: string) => zones.filter((z) => z.parentId === parentId)

  const renderZone = (zone: Zone, depth: number) => {
    const kids = childrenOf(zone.id)
    const isDropTarget = dropTargetId === zone.id && dragId !== null && dragId !== zone.id

    return (
      <div key={zone.id}>
        <div
          data-zone-row-id={zone.id}
          onPointerDown={beginRowDrag(zone)}
          onClick={() => selectZone(zone.id)}
          style={{ paddingLeft: 12 + depth * 14 }}
          className={cn(
            'group flex cursor-pointer items-center justify-between rounded-lg py-2 pe-3 text-sm transition-colors',
            isDropTarget
              ? 'ring-1 ring-inset ring-ink bg-surface-2'
              : selectedZoneId === zone.id
                ? 'bg-surface-2'
                : 'hover:bg-surface-2',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {depth > 0 && (
              <span className="shrink-0 text-xs leading-none text-muted" aria-hidden>
                ↳
              </span>
            )}
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
          <span className="flex items-center gap-1.5">
            <span className="tabular-nums text-xs text-muted">{countFor(zone.id)}</span>
            <button
              aria-label={t('zones.focusAria', { name: zone.name })}
              title={t('zones.focusZone')}
              onClick={(e) => {
                e.stopPropagation()
                focusZone(zone)
              }}
              className={cn(
                'hit-slop hover:text-ink',
                focusedZoneId === zone.id ? 'text-ink opacity-100' : 'hover-reveal text-muted',
              )}
            >
              ⤢
            </button>
            <button
              aria-label={t('zones.deleteAria', { name: zone.name })}
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(zone.id)
              }}
              className="hover-reveal hit-slop text-muted hover:text-ink"
            >
              ✕
            </button>
          </span>
        </div>

        {kids.map((child) => renderZone(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line p-2">
        <button
          onClick={handleAdd}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <span className="text-base leading-none">+</span> {t('zones.newZone')}
        </button>
      </div>

      <div
        data-zone-list
        className={cn(
          'min-h-0 flex-1 space-y-0.5 overflow-auto p-2',
          dragId && 'select-none',
          dropTargetId === '__root__' && dragId && 'bg-surface-2/60',
        )}
      >
        {zones.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted">{t('zones.emptyHint')}</p>
        )}
        {rootZones.map((zone) => renderZone(zone, 0))}
        <p className="px-3 pt-2 text-xs text-muted">
          {dragId ? t('zones.dragHint') : t('zones.unassigned', { count: unassigned })}
        </p>
      </div>

      {selectedZone && (
        <div className="space-y-2 border-t border-line p-3">
          <p className="text-xs font-medium text-ink">Smoking policy</p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['None', undefined],
                ['Smoking', 'smoking'],
                ['Non-smoking', 'non-smoking'],
              ] as const
            ).map(([label, value]) => (
              <Button
                key={label}
                size="sm"
                variant={(selectedZone.smoking ?? undefined) === value ? 'primary' : 'secondary'}
                onClick={() => updateZone(selectedZone.id, { smoking: value })}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            Non-smoking merges build vertically; smoking horizontally.
          </p>

          <p className="pt-2 text-xs font-medium text-ink">Table relocation</p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['Auto', undefined],
                ['Allowed', true],
                ['Blocked', false],
              ] as const
            ).map(([label, value]) => (
              <Button
                key={label}
                size="sm"
                variant={selectedZone.allowTableRelocation === value ? 'primary' : 'secondary'}
                onClick={() => updateZone(selectedZone.id, { allowTableRelocation: value })}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            Whether tables may be brought in/out for a cross-zone merge. Auto:
            only smoking / non-smoking zones relocate; indoor zones stay put.
          </p>
        </div>
      )}

      {selectedCount > 0 && (
        <div className="space-y-2 border-t border-line p-3">
          <p className="text-xs font-medium text-ink">
            {t('zones.assignTo', { count: selectedCount })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setTablesZone(selectedTableIds, null)}
            >
              {t('zones.auto')}
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
    </div>
  )
}
