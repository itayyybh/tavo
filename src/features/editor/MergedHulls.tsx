import { Circle, Group, Label, Rect, Tag, Text } from 'react-konva'
import type Konva from 'konva'
import type { MergedGroup, Table, TableType } from '@/types'
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

const CORNER = 8
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
        const border = isSelected ? 3 : 2
        const seats = groupCapacity(members, tableTypes)

        // Union box, for the seat badge (top-left) and the clearance halo.
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        let clearance = 0
        for (const m of members) {
          const box = aabb(m.position, m.size)
          minX = Math.min(minX, box.x)
          minY = Math.min(minY, box.y)
          maxX = Math.max(maxX, box.x + box.width)
          maxY = Math.max(maxY, box.y + box.height)
          const c = tableTypes.find((ty) => ty.id === m.typeId)?.clearance ?? 0
          clearance = Math.max(clearance, c)
        }

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
          const status = colors.status[m.status]
          const stroke = pass === 'grow' ? { stroke: status, strokeWidth: border * 2 } : {}
          const fill = pass === 'grow' ? status : colors.surface
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
            {isSelected && clearance > 0 && (
              // One continuous chair-clearance ring around the whole group — no
              // dotted lines between members, only around the outer perimeter.
              <Rect
                x={minX - clearance}
                y={minY - clearance}
                width={maxX - minX + clearance * 2}
                height={maxY - minY + clearance * 2}
                cornerRadius={CORNER + clearance}
                stroke={colors.muted}
                strokeWidth={1}
                dash={[4, 4]}
                fillEnabled={false}
                perfectDrawEnabled={false}
              />
            )}
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
          </Group>
        )
      })}
    </>
  )
}
