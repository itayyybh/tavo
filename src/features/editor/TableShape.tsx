import { Circle, Ellipse, Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Table, TableType, Vec2 } from '@/types'
import { seatsForTable } from '@/utils'
import type { CanvasColors } from './hooks/useCanvasColors'

interface TableShapeProps {
  table: Table
  type: TableType | undefined
  colors: CanvasColors
  /** The assigned zone's color, if any — shown as a small corner dot. */
  zoneColor?: string
  selected: boolean
  onSelect: (id: string, additive: boolean) => void
  onDragEnd: (id: string, center: Vec2) => void
  onStartRename: (id: string) => void
  registerNode: (id: string, node: Konva.Group | null) => void
}

/**
 * A single table on the canvas. Positioned by its CENTER (offset = half size) so
 * rotation and dragging pivot about the middle. Stroke encodes table status.
 */
export function TableShape({
  table,
  type,
  colors,
  zoneColor,
  selected,
  onSelect,
  onDragEnd,
  onStartRename,
  registerNode,
}: TableShapeProps) {
  const { x: w, y: h } = table.size
  const statusColor = colors.status[table.status]
  const shape = type?.shape ?? 'rectangle'
  const clearance = type?.clearance ?? 0
  const seats = seatsForTable(table, type)
  // Inset for corner glyphs: hug the top-left edge (round tables pull inward).
  const cornerX = shape === 'round' ? w / 2 - (Math.min(w, h) / 2 - 8) * 0.707 : 8
  const cornerY = shape === 'round' ? h / 2 - (Math.min(w, h) / 2 - 8) * 0.707 : 6

  return (
    <Group
      id={table.id}
      ref={(node) => registerNode(table.id, node)}
      x={table.position.x}
      y={table.position.y}
      offsetX={w / 2}
      offsetY={h / 2}
      rotation={table.rotation}
      draggable
      onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true
      }}
      onClick={(e: KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true
        onSelect(table.id, e.evt.shiftKey)
      }}
      onTap={(e: KonvaEventObject<Event>) => {
        e.cancelBubble = true
        onSelect(table.id, false)
      }}
      onDblClick={(e: KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true
        onStartRename(table.id)
      }}
      onDblTap={(e: KonvaEventObject<Event>) => {
        e.cancelBubble = true
        onStartRename(table.id)
      }}
      onDragStart={() => {
        // Keep an existing multi-selection intact; otherwise select just this one.
        if (!selected) onSelect(table.id, false)
      }}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => {
        onDragEnd(table.id, { x: e.target.x(), y: e.target.y() })
      }}
    >
      {selected && clearance > 0 && (
        // Circular clearance ("chair") line; the transformer's 4 anchors sit on it.
        <Ellipse
          x={w / 2}
          y={h / 2}
          radiusX={w / 2 + clearance}
          radiusY={h / 2 + clearance}
          stroke={colors.muted}
          strokeWidth={1}
          dash={[4, 4]}
          fillEnabled={false}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {shape === 'round' ? (
        <Circle
          x={w / 2}
          y={h / 2}
          radius={Math.min(w, h) / 2}
          fill={colors.surface}
          stroke={statusColor}
          strokeWidth={selected ? 3 : 2}
        />
      ) : (
        <Rect
          width={w}
          height={h}
          cornerRadius={8}
          fill={colors.surface}
          stroke={statusColor}
          strokeWidth={selected ? 3 : 2}
        />
      )}
      <Text
        text={table.label}
        width={w}
        height={h}
        align="center"
        verticalAlign="middle"
        wrap="none"
        fontSize={14}
        fill={colors.ink}
        listening={false}
      />
      {seats > 0 && (
        <Text
          x={cornerX}
          y={cornerY}
          text={String(seats)}
          fontSize={10}
          fill={colors.muted}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {zoneColor && (
        <Circle
          x={shape === 'round' ? w / 2 + (Math.min(w, h) / 2 - 8) * 0.707 : w - 10}
          y={shape === 'round' ? h / 2 - (Math.min(w, h) / 2 - 8) * 0.707 : 10}
          radius={4}
          fill={zoneColor}
          stroke={colors.surface}
          strokeWidth={1}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  )
}
