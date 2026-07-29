import { Circle, Ellipse, Group, Label, Rect, Tag, Text } from 'react-konva'
import type Konva from 'konva'
import type { MergedGroup, Table, TableStatus, TableType } from '@/types'
import { aabb, groupCapacity } from '@/utils'
import type { CanvasColors } from './hooks/useCanvasColors'

interface MergedHullsProps {
  groups: MergedGroup[]
  tables: Table[]
  tableTypes: TableType[]
  selectedIds: string[]
  colors: CanvasColors
  /** Register each group's Konva node so the body can track a live group drag. */
  registerNode: (groupId: string, node: Konva.Group | null) => void
}

const STATUS_ORDER: TableStatus[] = ['occupied', 'reserved', 'blocked', 'available']

/** The status that should represent the whole group (most "active" wins). */
function dominantStatus(members: Table[]): TableStatus {
  for (const s of STATUS_ORDER) if (members.some((m) => m.status === s)) return s
  return 'available'
}

const CORNER = 12
// How far the seam-bridge patch (below) reaches into each neighbor — wide enough
// to hide a round table's curvature near the touch point, not just the 1px overlap.
const BRIDGE_REACH = 14

/**
 * Draws each merged group as one continuous body while keeping every member its
 * own shape (a circle stays a circle). Passes, drawn above the members with
 * hit-testing off:
 *   1. each member grown by the border width, filled in its status color
 *   2. each member at its true size, filled in the surface color
 *   3. a small surface-colored bridge over each touching seam
 * Passes 1-2 erase the border wherever two members' true-size shapes overlap,
 * which is exact for two flush rectangle edges but not for a circle — a circle
 * only actually touches a neighbor at its center height, so above/below that its
 * curve pulls away and leaves a gap the overlap alone can't cover. The bridge
 * patches over that residual gap/border at every seam. Interaction still hits
 * the real members underneath.
 */
export function MergedHulls({
  groups,
  tables,
  tableTypes,
  selectedIds,
  colors,
  registerNode,
}: MergedHullsProps) {
  const selected = new Set(selectedIds)
  const shapeOf = (t: Table) =>
    tableTypes.find((ty) => ty.id === t.typeId)?.shape ?? 'rectangle'

  return (
    <>
      {groups.map((group) => {
        const members = tables.filter((t) => t.mergedGroupId === group.id)
        if (members.length < 2) return null

        const isSelected = members.some((m) => selected.has(m.id))
        // Neutral hairline border (status lives in the corner dot now); soft blue
        // when selected. Grow-pass thickness = visible ring width.
        const border = isSelected ? 2 : 1.5
        const borderColor = isSelected ? colors.accent : colors.line
        const growShadow = isSelected
          ? { shadowColor: colors.accent, shadowBlur: 12, shadowOpacity: 0.3 }
          : { shadowColor: '#000000', shadowBlur: 6, shadowOffsetY: 2, shadowOpacity: 0.08 }
        const seats = groupCapacity(members, tableTypes, group)

        // Union box, for the seat badge (top-left).
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const m of members) {
          const box = aabb(m.position, m.size)
          minX = Math.min(minX, box.x)
          minY = Math.min(minY, box.y)
          maxX = Math.max(maxX, box.x + box.width)
          maxY = Math.max(maxY, box.y + box.height)
        }
        // Per-member chair-clearance outline: follows each shape at the clearance
        // distance (a group override applies to all members, else each member's
        // own type clearance). Round → circle, others → ellipse that rotates with
        // the table — never a single axis-aligned box around the whole group.
        const clearanceOf = (m: Table) =>
          group.clearance ?? (tableTypes.find((ty) => ty.id === m.typeId)?.clearance ?? 0)

        // Members are arranged left-to-right (see arrangeCluster) — bridge each
        // adjacent pair's seam with a patch sized to their shared vertical span.
        const sortedMembers = [...members].sort(
          (a, b) => a.position.x - b.position.x || a.position.y - b.position.y,
        )
        const bridges = []
        for (let i = 0; i < sortedMembers.length - 1; i++) {
          const a = sortedMembers[i]
          const b = sortedMembers[i + 1]
          const seamX = (a.position.x + a.size.x / 2 + (b.position.x - b.size.x / 2)) / 2
          const top = Math.max(a.position.y - a.size.y / 2, b.position.y - b.size.y / 2)
          const bottom = Math.min(a.position.y + a.size.y / 2, b.position.y + b.size.y / 2)
          if (bottom <= top) continue
          bridges.push({ x: seamX - BRIDGE_REACH, y: top, width: BRIDGE_REACH * 2, height: bottom - top })
        }

        const memberShape = (m: Table, pass: 'grow' | 'fill') => {
          const { x: w, y: h } = m.size
          const stroke =
            pass === 'grow'
              ? { stroke: borderColor, strokeWidth: border * 2, ...growShadow, shadowForStrokeEnabled: false }
              : {}
          const fill = pass === 'grow' ? borderColor : colors.surface
          return shapeOf(m) === 'round' ? (
            <Circle
              key={pass + m.id}
              x={m.position.x}
              y={m.position.y}
              radius={Math.min(w, h) / 2}
              fill={fill}
              perfectDrawEnabled={false}
              {...stroke}
            />
          ) : (
            <Rect
              key={pass + m.id}
              x={m.position.x}
              y={m.position.y}
              offsetX={w / 2}
              offsetY={h / 2}
              rotation={m.rotation}
              width={w}
              height={h}
              cornerRadius={CORNER}
              fill={fill}
              perfectDrawEnabled={false}
              {...stroke}
            />
          )
        }

        return (
          <Group
            key={group.id}
            ref={(node) => registerNode(group.id, node)}
            listening={false}
          >
            {isSelected &&
              members.map((m) => {
                const c = clearanceOf(m)
                if (c <= 0) return null
                const { x: w, y: h } = m.size
                return shapeOf(m) === 'round' ? (
                  <Circle
                    key={'clr' + m.id}
                    x={m.position.x}
                    y={m.position.y}
                    radius={Math.min(w, h) / 2 + c}
                    stroke={colors.muted}
                    strokeWidth={1}
                    dash={[4, 4]}
                    fillEnabled={false}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                ) : (
                  <Ellipse
                    key={'clr' + m.id}
                    x={m.position.x}
                    y={m.position.y}
                    radiusX={w / 2 + c}
                    radiusY={h / 2 + c}
                    rotation={m.rotation}
                    stroke={colors.muted}
                    strokeWidth={1}
                    dash={[4, 4]}
                    fillEnabled={false}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                )
              })}
            {members.map((m) => memberShape(m, 'grow'))}
            {members.map((m) => memberShape(m, 'fill'))}
            {bridges.map((b, i) => (
              <Rect
                key={`bridge${i}`}
                x={b.x}
                y={b.y}
                width={b.width}
                height={b.height}
                fill={colors.surface}
                perfectDrawEnabled={false}
              />
            ))}
            {members.map((m) => (
              // Kept upright regardless of the member's own rotation.
              <Text
                key={'label' + m.id}
                x={m.position.x - m.size.x / 2}
                y={m.position.y - 7}
                width={m.size.x}
                align="center"
                text={m.label}
                fontSize={14}
                fill={colors.ink}
              />
            ))}
            <Label x={minX} y={minY - 20}>
              <Tag fill={isSelected ? colors.ink : colors.muted} cornerRadius={4} />
              <Text text={`${seats} seats`} fontSize={11} fill={colors.surface} padding={4} />
            </Label>
            {(() => {
              // One status dot for the whole body (available = green token), pinned
              // to the top-right corner of the largest member table.
              const dot = colors.status[dominantStatus(members)]
              const largest = members.reduce((a, b) =>
                b.size.x * b.size.y > a.size.x * a.size.y ? b : a,
              )
              return (
                <Circle
                  x={largest.position.x + largest.size.x / 2 - 9}
                  y={largest.position.y - largest.size.y / 2 + 9}
                  radius={4}
                  fill={dot}
                  stroke={colors.surface}
                  strokeWidth={1.5}
                  perfectDrawEnabled={false}
                />
              )
            })()}
          </Group>
        )
      })}
    </>
  )
}
