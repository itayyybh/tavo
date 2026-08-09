import { useRef, type RefObject } from 'react'
import { Circle, Group, Line, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { FloorTableStatus, TableType, Vec2 } from '@/types'
import { mixHex } from '@/utils'
import { useSettingsStore } from '@/stores'
import type { EffectiveTable, TableUrgency } from '@/services/floor'
import type { FloorCanvasColors } from './hooks/useFloorColors'
import { useNodeColorTween } from './hooks/useNodeColorTween'
import { useNodePositionGlide } from './hooks/useNodePositionGlide'

/** How far a table body is tinted toward its status color (0 = surface, 1 = full). */
export const FLOOR_TINT = 0.22

/** Reserved-table mark: dash length, and how far above the label it sits (world px). */
const RESERVED_MARK = 8
const RESERVED_MARK_Y = 12

/**
 * Reserved-table ramp: as a booking nears, escalate through DISCRETE, vivid
 * status hues — calm blue (reserved) → amber (approaching) → red (due/overdue) —
 * while deepening the body tint and thickening the border. Discrete on purpose:
 * blending blue↔amber in RGB passes through gray (they're near-complementary),
 * which read as a blocked table. `far` (>~30m out) stays plain reserved blue.
 * Static — no motion — so a busy floor stays legible.
 */
const RESERVED_RAMP: Record<
  'far' | TableUrgency,
  { colorKey: FloorTableStatus; tint: number; border: number }
> = {
  far: { colorKey: 'reserved', tint: 0, border: 0 },
  soon: { colorKey: 'reserved', tint: 0.03, border: 0 },
  due: { colorKey: 'cleaning', tint: 0.07, border: 0.5 },
  imminent: { colorKey: 'cleaning', tint: 0.13, border: 0.75 },
  overdue: { colorKey: 'occupied', tint: 0.18, border: 1 },
}

interface FloorTableNodeProps {
  et: EffectiveTable
  type: TableType | undefined
  colors: FloorCanvasColors
  /** Primary caption — the seated/expected guest name, or the table label. */
  primary: string
  /** Muted subtitle — party size + table, or seat count. */
  secondary?: string
  /** Part of a base merged group — the hull owns the caption; draw body only. */
  merged?: boolean
  /** Tap handler — when set, the table is interactive (opens its action menu). */
  onSelect?: (id: string, additive: boolean) => void
  /** Fires continuously while dragging — lets a merged group track the cursor live. */
  onDragMove?: (id: string) => void
  /** Drag-move handler — fires with the table's new center on drag end. */
  onDragEnd?: (id: string, center: Vec2) => void
  /** Register this table's Konva node so its group can be moved live during a drag. */
  registerNode?: (id: string, node: Konva.Group | null) => void
  /** Highlight this table (selected / its action menu is open). */
  selected?: boolean
  /** Ids just dropped by a drag — such a table skips its glide (already placed). */
  dragIds?: RefObject<Set<string>>
}

const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif'

/**
 * A single table on the Live Floor. Read-only and status-forward: unlike the
 * editor's table (neutral hairline + tiny dot), the floor colors the border and a
 * soft body tint by EFFECTIVE status so occupancy reads at a glance, and shows the
 * seated party's name when occupied. Positioned by its center, like the editor.
 */
export function FloorTableNode({
  et,
  type,
  colors,
  primary,
  secondary,
  merged,
  onSelect,
  onDragMove,
  onDragEnd,
  registerNode,
  selected,
  dragIds,
}: FloorTableNodeProps) {
  const { base, status, position, rotation } = et
  const { x: w, y: h } = base.size
  const showBookedMark = useSettingsStore((s) => s.showBookedMark)
  const shape = type?.shape ?? 'rectangle'
  const round = shape === 'round'

  const isActive = status !== 'available'
  const conflict = !!et.conflict

  // Reserved tables escalate blue → amber → red as their booking nears (see
  // RESERVED_RAMP). A far-out reservation stays plain blue.
  const ramp = status === 'reserved' ? RESERVED_RAMP[et.urgency ?? 'far'] : undefined
  const statusColor = ramp ? colors.status[ramp.colorKey] : colors.status[status]
  const tint = FLOOR_TINT + (ramp?.tint ?? 0)

  // A double-book overrides the border with the alarm hue + a dashed stroke, so
  // the clash is unmissable regardless of the table's underlying status.
  const border = conflict
    ? colors.conflict
    : selected
      ? colors.accent
      : isActive
        ? statusColor
        : colors.line
  const borderWidth = conflict ? 2.5 : selected || isActive ? 2 + (ramp?.border ?? 0) : 1.5
  // Whole body painted a solid tint of the status color (flat, no alpha).
  const bodyFill = isActive ? mixHex(colors.surface, statusColor, tint) : colors.surface

  const dotX = round ? w / 2 + (Math.min(w, h) / 2 - 7) * 0.707 : w - 9
  const dotY = round ? h / 2 - (Math.min(w, h) / 2 - 7) * 0.707 : 9

  // Ease the body + status dot between status colors instead of snapping.
  const bodyRef = useRef<Konva.Shape>(null)
  const dotRef = useRef<Konva.Shape>(null)
  useNodeColorTween(bodyRef, bodyFill, border)
  useNodeColorTween(dotRef, statusColor)

  // Glide the whole table group to a new spot on store-committed moves (seat,
  // merge, split, restore) — but not while it's being dragged.
  const groupRef = useRef<Konva.Group>(null)
  const noDrag = useRef<Set<string>>(new Set())
  useNodePositionGlide(groupRef, position.x, position.y, dragIds ?? noDrag, base.id)

  const body = round ? (
    <Circle
      ref={(n) => void (bodyRef.current = n)}
      x={w / 2}
      y={h / 2}
      radius={Math.min(w, h) / 2}
      fill={bodyFill}
      stroke={border}
      strokeWidth={borderWidth}
      dash={conflict ? [7, 4] : undefined}
      shadowColor="#000000"
      shadowBlur={6}
      shadowOffset={{ x: 0, y: 2 }}
      shadowOpacity={0.08}
      shadowForStrokeEnabled={false}
      perfectDrawEnabled={false}
    />
  ) : (
    <Rect
      ref={(n) => void (bodyRef.current = n)}
      width={w}
      height={h}
      cornerRadius={12}
      fill={bodyFill}
      stroke={border}
      strokeWidth={borderWidth}
      dash={conflict ? [7, 4] : undefined}
      shadowColor="#000000"
      shadowBlur={6}
      shadowOffset={{ x: 0, y: 2 }}
      shadowOpacity={0.08}
      shadowForStrokeEnabled={false}
      perfectDrawEnabled={false}
    />
  )

  return (
    <Group
      ref={(node) => {
        groupRef.current = node
        registerNode?.(base.id, node)
      }}
      x={position.x}
      y={position.y}
      offsetX={w / 2}
      offsetY={h / 2}
      rotation={rotation}
      listening={!!onSelect}
      draggable={!!onDragEnd}
      onDragMove={(e: KonvaEventObject<DragEvent>) => {
        e.cancelBubble = true
        onDragMove?.(base.id)
      }}
      onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true
      }}
      onClick={(e: KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true
        onSelect?.(base.id, e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey)
      }}
      onTap={(e: KonvaEventObject<Event>) => {
        e.cancelBubble = true
        onSelect?.(base.id, false)
      }}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => {
        e.cancelBubble = true
        onDragEnd?.(base.id, { x: e.target.x(), y: e.target.y() })
      }}
      onMouseEnter={(e: KonvaEventObject<MouseEvent>) => {
        if (!onSelect) return
        const stage = e.target.getStage()
        if (stage) stage.container().style.cursor = 'pointer'
      }}
      onMouseLeave={(e: KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage()
        if (stage) stage.container().style.cursor = 'default'
      }}
    >
      {body}
      {!merged && (
        // Counter-rotated so captions stay upright as the table rotates.
        <Group x={w / 2} y={h / 2} rotation={-rotation} listening={false}>
          {showBookedMark && (status === 'reserved' || !!et.upcomingReservationId) && (
            // A small '-' just above the label marks a table that holds a booking
            // — shown for ANY upcoming reservation, however far off (a far booking
            // leaves the table `available` with only `upcomingReservationId` set),
            // and independent of the urgency color ramp.
            <Line
              points={[-RESERVED_MARK / 2, -RESERVED_MARK_Y, RESERVED_MARK / 2, -RESERVED_MARK_Y]}
              stroke={colors.status.reserved}
              strokeWidth={2}
              lineCap="round"
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
          <Text
            text={primary}
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            align="center"
            verticalAlign="middle"
            wrap="none"
            ellipsis
            fontFamily={FONT}
            fontSize={14}
            fontStyle="600"
            fill={colors.ink}
            listening={false}
          />
          {secondary && (
            <Text
              text={secondary}
              x={-w / 2}
              y={h / 2 + 7}
              width={w}
              align="center"
              wrap="none"
              ellipsis
              fontFamily={FONT}
              fontSize={10}
              fill={colors.muted}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
        </Group>
      )}
      {!merged && (
        <Circle
          ref={(n) => void (dotRef.current = n)}
          x={dotX}
          y={dotY}
          radius={4}
          fill={statusColor}
          stroke={colors.surface}
          strokeWidth={1.5}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {conflict && !merged && (
        // Alarm badge (top-left) — a double-book the host must resolve.
        <Group x={round ? w / 2 - (Math.min(w, h) / 2 - 7) * 0.707 : 9} y={dotY} listening={false}>
          <Circle
            radius={7}
            fill={colors.conflict}
            stroke={colors.surface}
            strokeWidth={1.5}
            perfectDrawEnabled={false}
          />
          <Text
            text="!"
            x={-7}
            y={-7}
            width={14}
            height={14}
            align="center"
            verticalAlign="middle"
            fontFamily={FONT}
            fontSize={11}
            fontStyle="700"
            fill={colors.surface}
            listening={false}
            perfectDrawEnabled={false}
          />
        </Group>
      )}
    </Group>
  )
}
