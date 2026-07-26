import { Circle, Rect } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Obstacle, Vec2 } from '@/types'
import type { CanvasColors } from './hooks/useCanvasColors'

interface ObstacleShapeProps {
  obstacle: Obstacle
  colors: CanvasColors
  selected: boolean
  onSelect: (id: string) => void
  onDragEnd: (id: string, center: Vec2) => void
  registerNode: (id: string, node: Konva.Node | null) => void
}

/**
 * A physical no-go area (wall = rectangle, object = round). Rendered as a solid
 * muted shape so it reads as "not a table". Resizable via the transformer.
 */
export function ObstacleShape({
  obstacle,
  colors,
  selected,
  onSelect,
  onDragEnd,
  registerNode,
}: ObstacleShapeProps) {
  const { x: w, y: h } = obstacle.size
  const common = {
    id: obstacle.id,
    x: obstacle.position.x,
    y: obstacle.position.y,
    rotation: obstacle.rotation,
    fill: colors.muted,
    opacity: selected ? 0.35 : 0.22,
    stroke: colors.muted,
    strokeWidth: selected ? 2 : 1,
    perfectDrawEnabled: false,
    draggable: true,
    onMouseDown: (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true
    },
    onClick: (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true
      onSelect(obstacle.id)
    },
    onTap: (e: KonvaEventObject<Event>) => {
      e.cancelBubble = true
      onSelect(obstacle.id)
    },
    onDragEnd: (e: KonvaEventObject<DragEvent>) => {
      onDragEnd(obstacle.id, { x: e.target.x(), y: e.target.y() })
    },
  }

  if (obstacle.kind === 'object') {
    return (
      <Circle
        ref={(node) => registerNode(obstacle.id, node)}
        radius={Math.min(w, h) / 2}
        {...common}
      />
    )
  }

  return (
    <Rect
      ref={(node) => registerNode(obstacle.id, node)}
      width={w}
      height={h}
      offsetX={w / 2}
      offsetY={h / 2}
      cornerRadius={2}
      {...common}
    />
  )
}
