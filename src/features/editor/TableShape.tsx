import { Circle, Ellipse, Group, Rect, Text } from 'react-konva'
import Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Table, TableType, Vec2 } from '@/types'
import { seatsForTable } from '@/utils'
import type { CanvasColors } from './hooks/useCanvasColors'

interface TableShapeProps {
  table: Table
  type: TableType | undefined
  colors: CanvasColors
  /** Part of a merged group — the group hull owns the label/seats/status instead. */
  merged?: boolean
  selected: boolean
  onSelect: (id: string, additive: boolean) => void
  onDragMove: (id: string) => void
  onDragEnd: (id: string, center: Vec2) => void
  onStartRename: (id: string) => void
  registerNode: (id: string, node: Konva.Group | null) => void
}

const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif'
// Chair glyph geometry (see chairSlots). Kept small so chairs read as furniture,
// never as UI. Hidden on tables too small to host them without crowding.
const CHAIR_GAP = 5
const CHAIR_LEN = 12
const CHAIR_THK = 4
const MIN_CHAIR_SIDE = 40

interface ChairSlot {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Chair positions in the table's local (top-left origin) frame. Rectangles get a
 * few bars per side, distributed toward the longer edges; round tables get dots
 * evenly around the rim. Positions only — styling stays with the render.
 */
function chairSlots(shape: string, w: number, h: number, seats: number): ChairSlot[] {
  if (seats <= 0) return []
  if (shape === 'round') {
    const R = Math.min(w, h) / 2 + CHAIR_GAP + CHAIR_THK / 2
    return Array.from({ length: seats }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / seats
      return {
        x: w / 2 + R * Math.cos(a) - CHAIR_THK / 2,
        y: h / 2 + R * Math.sin(a) - CHAIR_THK / 2,
        w: CHAIR_THK,
        h: CHAIR_THK,
      }
    })
  }
  // Split seats across sides, weighting the longer pair of edges.
  const tb = Math.round((seats * w) / (w + h))
  const lr = seats - tb
  const top = Math.ceil(tb / 2)
  const bottom = tb - top
  const left = Math.ceil(lr / 2)
  const right = lr - left
  const slots: ChairSlot[] = []
  const horiz = (count: number, cy: number) => {
    for (let i = 0; i < count; i++) {
      const cx = (w * (i + 0.5)) / count
      slots.push({
        x: cx - CHAIR_LEN / 2,
        y: cy - CHAIR_THK / 2,
        w: CHAIR_LEN,
        h: CHAIR_THK,
      })
    }
  }
  const vert = (count: number, cx: number) => {
    for (let i = 0; i < count; i++) {
      const cy = (h * (i + 0.5)) / count
      slots.push({
        x: cx - CHAIR_THK / 2,
        y: cy - CHAIR_LEN / 2,
        w: CHAIR_THK,
        h: CHAIR_LEN,
      })
    }
  }
  horiz(top, -CHAIR_GAP - CHAIR_THK / 2)
  horiz(bottom, h + CHAIR_GAP + CHAIR_THK / 2)
  vert(left, -CHAIR_GAP - CHAIR_THK / 2)
  vert(right, w + CHAIR_GAP + CHAIR_THK / 2)
  return slots
}

/**
 * A single table on the canvas. Positioned by its CENTER (offset = half size) so
 * rotation and dragging pivot about the middle.
 *
 * Visual hierarchy (premium, minimal): the label is the primary element; the
 * border is a neutral hairline (never the status); status is a tiny corner dot
 * (the zone color when available); capacity is a muted subtitle below; chairs are
 * faint furniture glyphs. Selection is a soft blue outline + glow; hover lifts the
 * shadow via an imperative Konva tween (no React re-render).
 */
export function TableShape({
  table,
  type,
  colors,
  merged,
  selected,
  onSelect,
  onDragMove,
  onDragEnd,
  onStartRename,
  registerNode,
}: TableShapeProps) {
  const { x: w, y: h } = table.size
  const shape = type?.shape ?? 'rectangle'
  const clearance = type?.clearance ?? 0
  const seats = seatsForTable(table, type)

  // Status → a tiny dot, using its restrained token color (available = green).
  const dotColor = colors.status[table.status]
  const dotX = shape === 'round' ? w / 2 + (Math.min(w, h) / 2 - 7) * 0.707 : w - 9
  const dotY = shape === 'round' ? h / 2 - (Math.min(w, h) / 2 - 7) * 0.707 : 9

  const border = selected ? colors.accent : colors.line
  const borderWidth = selected ? 2 : 1.5

  const chairs =
    !merged && Math.min(w, h) >= MIN_CHAIR_SIDE ? chairSlots(shape, w, h, seats) : []

  // Hover only lifts the shadow; selection keeps its own glow untouched. Bound to
  // the body shape so `e.target` is the node to tween — no render-phase ref read.
  const hover = (on: boolean) => (e: KonvaEventObject<MouseEvent>) => {
    const node = e.target
    const stage = node.getStage()
    if (stage) stage.container().style.cursor = on ? 'pointer' : 'default'
    if (selected) return
    node.to({
      shadowBlur: on ? 16 : 6,
      shadowOffsetY: on ? 6 : 2,
      shadowOpacity: on ? 0.12 : 0.08,
      duration: 0.18,
      easing: Konva.Easings.EaseOut,
    })
  }

  // Soft blue glow when selected; a whisper of a drop shadow otherwise.
  const bodyShadow = selected
    ? {
        shadowColor: colors.accent,
        shadowBlur: 12,
        shadowOffset: { x: 0, y: 0 },
        shadowOpacity: 0.35,
      }
    : {
        shadowColor: '#000000',
        shadowBlur: 6,
        shadowOffset: { x: 0, y: 2 },
        shadowOpacity: 0.08,
      }

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
        onSelect(table.id, e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey)
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
      onDragMove={() => onDragMove(table.id)}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => {
        onDragEnd(table.id, { x: e.target.x(), y: e.target.y() })
      }}
    >
      {selected && clearance > 0 && !merged && (
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
      {/* Faint chair glyphs — furniture, never UI. */}
      {chairs.map((c, i) => (
        <Rect
          key={`chair${i}`}
          x={c.x}
          y={c.y}
          width={c.w}
          height={c.h}
          cornerRadius={2}
          fill={colors.line}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
      {shape === 'round' ? (
        <Circle
          x={w / 2}
          y={h / 2}
          radius={Math.min(w, h) / 2}
          fill={colors.surface}
          stroke={border}
          strokeWidth={borderWidth}
          {...bodyShadow}
          shadowForStrokeEnabled={false}
          onMouseEnter={hover(true)}
          onMouseLeave={hover(false)}
        />
      ) : (
        <Rect
          width={w}
          height={h}
          cornerRadius={12}
          fill={colors.surface}
          stroke={border}
          strokeWidth={borderWidth}
          {...bodyShadow}
          shadowForStrokeEnabled={false}
          onMouseEnter={hover(true)}
          onMouseLeave={hover(false)}
        />
      )}
      {!merged && (
        // Counter-rotated group pinned at the table center, so text stays upright
        // as the table rotates. Label centered (primary); capacity below (muted).
        <Group x={w / 2} y={h / 2} rotation={-table.rotation} listening={false}>
          <Text
            text={table.label}
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            align="center"
            verticalAlign="middle"
            wrap="none"
            fontFamily={FONT}
            fontSize={16}
            fontStyle="600"
            fill={colors.ink}
            listening={false}
          />
          {seats > 0 && (
            <Text
              text={`${seats}`}
              x={-w / 2}
              y={h / 2 + 8}
              width={w}
              align="center"
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
        // Tiny status dot — immediately visible, never dominant.
        <Circle
          x={dotX}
          y={dotY}
          radius={4}
          fill={dotColor}
          stroke={colors.surface}
          strokeWidth={1.5}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  )
}
