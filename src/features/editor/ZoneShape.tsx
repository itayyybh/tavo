import { Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Vec2, Zone } from '@/types'
import type { CanvasColors } from './hooks/useCanvasColors'

interface ZoneShapeProps {
  zone: Zone
  /** Nesting depth (root = 0); deeper zones read slightly stronger. */
  depth: number
  colors: CanvasColors
  selected: boolean
  onSelect: (id: string) => void
  onDragEnd: (id: string, center: Vec2) => void
  registerNode: (id: string, node: Konva.Group | null) => void
}

/**
 * A zone region drawn behind tables. Its soft pastel fill is click-through while
 * unselected (so marquee/empty clicks pass through and double-click selects it via
 * the stage); once selected it becomes listening + draggable so it can be moved.
 */
export function ZoneShape({
  zone,
  depth,
  colors,
  selected,
  onSelect,
  onDragEnd,
  registerNode,
}: ZoneShapeProps) {
  const { x: w, y: h } = zone.size
  // Deeper nesting reads a touch stronger so a child region stands out on its parent.
  const baseOpacity = Math.min(0.16 + depth * 0.08, 0.34)
  const fillOpacity = selected ? Math.min(baseOpacity + 0.12, 0.44) : baseOpacity
  const label = zone.locked ? `🔒 ${zone.name}` : zone.name

  return (
    <Group
      id={zone.id}
      ref={(node) => registerNode(zone.id, node)}
      x={zone.position.x}
      y={zone.position.y}
      offsetX={w / 2}
      offsetY={h / 2}
      draggable={selected}
      onDragStart={() => onSelect(zone.id)}
      onDragEnd={(e: KonvaEventObject<DragEvent>) =>
        onDragEnd(zone.id, { x: e.target.x(), y: e.target.y() })
      }
    >
      <Rect
        width={w}
        height={h}
        cornerRadius={10}
        fill={zone.color}
        opacity={fillOpacity}
        stroke={colors.muted}
        strokeWidth={1}
        dash={zone.locked ? undefined : [6, 6]}
        listening={selected}
        perfectDrawEnabled={false}
      />
      <Text
        x={10}
        y={8}
        text={label}
        fontSize={12}
        fontStyle="500"
        fill={colors.inkSoft}
        wrap="none"
        listening={false}
      />
    </Group>
  )
}
