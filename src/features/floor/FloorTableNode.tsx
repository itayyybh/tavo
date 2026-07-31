import { Circle, Group, Rect, Text } from 'react-konva'
import type { TableType } from '@/types'
import type { EffectiveTable } from '@/services/floor'
import type { FloorCanvasColors } from './hooks/useFloorColors'

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
}

const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif'

/** Soft status tint applied over the table body (0 = no tint, i.e. available). */
const TINT: Record<EffectiveTable['status'], number> = {
  available: 0,
  reserved: 0.1,
  occupied: 0.14,
  cleaning: 0.12,
  blocked: 0.1,
}

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
}: FloorTableNodeProps) {
  const { base, status, position } = et
  const { x: w, y: h } = base.size
  const shape = type?.shape ?? 'rectangle'
  const round = shape === 'round'

  const statusColor = colors.status[status]
  const isActive = status !== 'available'
  const border = isActive ? statusColor : colors.line
  const borderWidth = isActive ? 2 : 1.5
  const tint = TINT[status]

  const dotX = round ? w / 2 + (Math.min(w, h) / 2 - 7) * 0.707 : w - 9
  const dotY = round ? h / 2 - (Math.min(w, h) / 2 - 7) * 0.707 : 9

  const body = round ? (
    <Circle
      x={w / 2}
      y={h / 2}
      radius={Math.min(w, h) / 2}
      fill={colors.surface}
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
      fill={colors.surface}
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

  const tintShape =
    tint > 0 &&
    (round ? (
      <Circle
        x={w / 2}
        y={h / 2}
        radius={Math.min(w, h) / 2}
        fill={statusColor}
        opacity={tint}
        listening={false}
        perfectDrawEnabled={false}
      />
    ) : (
      <Rect
        width={w}
        height={h}
        cornerRadius={12}
        fill={statusColor}
        opacity={tint}
        listening={false}
        perfectDrawEnabled={false}
      />
    ))

  return (
    <Group
      x={position.x}
      y={position.y}
      offsetX={w / 2}
      offsetY={h / 2}
      rotation={base.rotation}
      listening={false}
    >
      {body}
      {tintShape}
      {!merged && (
        // Counter-rotated so captions stay upright as the table rotates.
        <Group x={w / 2} y={h / 2} rotation={-base.rotation} listening={false}>
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
