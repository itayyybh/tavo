import { Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Vec2, Zone } from '@/types'
import type { CanvasColors } from './hooks/useCanvasColors'

interface ZoneShapeProps {
  zone: Zone
  colors: CanvasColors
  selected: boolean
  onSelect: (id: string) => void
  onDragEnd: (id: string, center: Vec2) => void
  onStartRename: (id: string) => void
  registerNode: (id: string, node: Konva.Group | null) => void
}

const LABEL_HEIGHT = 22

/**
 * A zone region drawn behind tables. The faint fill is non-interactive so it
 * never steals marquee/empty clicks; the name chip (top-left) selects, renames,
 * and drags the whole zone.
 */
export function ZoneShape({
  zone,
  colors,
  selected,
  onSelect,
  onDragEnd,
  onStartRename,
  registerNode,
}: ZoneShapeProps) {
  const { x: w, y: h } = zone.size
  const chipWidth = Math.max(48, zone.name.length * 7 + 16)

  return (
    <Group
      id={zone.id}
      ref={(node) => registerNode(zone.id, node)}
      x={zone.position.x}
      y={zone.position.y}
      offsetX={w / 2}
      offsetY={h / 2}
      draggable
      onDragStart={() => onSelect(zone.id)}
      onDragEnd={(e: KonvaEventObject<DragEvent>) =>
        onDragEnd(zone.id, { x: e.target.x(), y: e.target.y() })
      }
    >
      <Rect
        width={w}
        height={h}
        cornerRadius={10}
        fill={colors.ink}
        opacity={selected ? 0.06 : 0.03}
        stroke={colors.muted}
        strokeWidth={1}
        dash={[6, 6]}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Group
        onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true
        }}
        onClick={(e: KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true
          onSelect(zone.id)
        }}
        onTap={(e: KonvaEventObject<Event>) => {
          e.cancelBubble = true
          onSelect(zone.id)
        }}
        onDblClick={(e: KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true
          onStartRename(zone.id)
        }}
        onDblTap={(e: KonvaEventObject<Event>) => {
          e.cancelBubble = true
          onStartRename(zone.id)
        }}
      >
        <Rect
          width={chipWidth}
          height={LABEL_HEIGHT}
          cornerRadius={6}
          fill={colors.surface}
          stroke={selected ? colors.ink : colors.line}
          strokeWidth={1}
          perfectDrawEnabled={false}
        />
        <Text
          x={8}
          height={LABEL_HEIGHT}
          width={chipWidth - 12}
          verticalAlign="middle"
          text={zone.name}
          fontSize={12}
          fontStyle="500"
          fill={colors.inkSoft}
          wrap="none"
          listening={false}
        />
      </Group>
    </Group>
  )
}
