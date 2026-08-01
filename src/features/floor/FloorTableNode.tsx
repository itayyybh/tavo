import { Circle, Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { TableType, Vec2 } from '@/types'
import { mixHex } from '@/utils'
import type { EffectiveTable } from '@/services/floor'
import type { FloorCanvasColors } from './hooks/useFloorColors'

/** How far a table body is tinted toward its status color (0 = surface, 1 = full). */
export const FLOOR_TINT = 0.22

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
}: FloorTableNodeProps) {
  const { base, status, position, rotation } = et
  const { x: w, y: h } = base.size
  const shape = type?.shape ?? 'rectangle'
  const round = shape === 'round'

  const statusColor = colors.status[status]
  const isActive = status !== 'available'
  const border = selected ? colors.accent : isActive ? statusColor : colors.line
  const borderWidth = selected || isActive ? 2 : 1.5
  // Whole body painted a solid tint of the status color (flat, no alpha).
  const bodyFill = isActive ? mixHex(colors.surface, statusColor, FLOOR_TINT) : colors.surface

  const dotX = round ? w / 2 + (Math.min(w, h) / 2 - 7) * 0.707 : w - 9
  const dotY = round ? h / 2 - (Math.min(w, h) / 2 - 7) * 0.707 : 9

  const body = round ? (
    <Circle
      x={w / 2}
      y={h / 2}
      radius={Math.min(w, h) / 2}
      fill={bodyFill}
      stroke={border}
      strokeWidth={borderWidth}
      shadowColor="#000000"
      shadowBlur={6}
      shadowOffset={{ x: 0, y: 2 }}
      shadowOpacity={0.08}
      shadowForStrokeEnabled={false}
      perfectDrawEnabled={false}
    />
  ) : (
    <Rect
      width={w}
      height={h}
      cornerRadius={12}
      fill={bodyFill}
      stroke={border}
      strokeWidth={borderWidth}
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
      ref={(node) => registerNode?.(base.id, node)}
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
    </Group>
  )
}
