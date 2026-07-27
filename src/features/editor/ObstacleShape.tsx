import { Circle, Group, Line, Rect } from 'react-konva'
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
 * A no-go area for tables. `wall` = solid rectangle, `object` = solid round,
 * `path` = a translucent dashed lane (walkable keep-clear route). Resizable via
 * the transformer.
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

  if (obstacle.kind === 'path' && obstacle.points?.length) {
    // Freehand brush lane: a thick translucent rounded stroke. `common` sets x/y to
    // the bbox center, and the stored points are relative to it, so drag/copy just
    // move the center — the stroke follows.
    const width = obstacle.brushWidth ?? 40
    return (
      <Line
        ref={(node) => registerNode(obstacle.id, node)}
        {...common}
        points={obstacle.points.flatMap((p) => [p.x, p.y])}
        fillEnabled={false}
        stroke={colors.muted}
        strokeWidth={width}
        lineCap="round"
        lineJoin="round"
        opacity={selected ? 0.32 : 0.2}
        hitStrokeWidth={Math.max(width, 16)}
      />
    )
  }

  if (obstacle.kind === 'path') {
    // Legacy fixed-rect path (pre-brush layouts) — dashed lane fallback.
    const horizontal = w >= h
    return (
      <Group
        ref={(node) => registerNode(obstacle.id, node)}
        id={obstacle.id}
        x={obstacle.position.x}
        y={obstacle.position.y}
        width={w}
        height={h}
        offsetX={w / 2}
        offsetY={h / 2}
        rotation={obstacle.rotation}
        draggable
        onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true
        }}
        onClick={(e: KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true
          onSelect(obstacle.id)
        }}
        onTap={(e: KonvaEventObject<Event>) => {
          e.cancelBubble = true
          onSelect(obstacle.id)
        }}
        onDragEnd={(e: KonvaEventObject<DragEvent>) => {
          onDragEnd(obstacle.id, { x: e.target.x(), y: e.target.y() })
        }}
      >
        <Rect
          width={w}
          height={h}
          cornerRadius={6}
          fill={colors.muted}
          opacity={selected ? 0.16 : 0.1}
          stroke={colors.muted}
          strokeWidth={selected ? 1.5 : 1}
          dash={[6, 6]}
          perfectDrawEnabled={false}
        />
        <Line
          points={horizontal ? [0, h / 2, w, h / 2] : [w / 2, 0, w / 2, h]}
          stroke={colors.muted}
          strokeWidth={1}
          dash={[10, 8]}
          opacity={0.55}
          listening={false}
          perfectDrawEnabled={false}
        />
      </Group>
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
