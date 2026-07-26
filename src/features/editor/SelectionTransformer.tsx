import { useEffect, useRef } from 'react'
import { Transformer } from 'react-konva'
import type Konva from 'konva'
import type { Vec2 } from '@/types'

interface SelectionTransformerProps {
  selectedIds: string[]
  /** Re-run attachment when the table set changes (e.g. after add/undo). */
  tablesVersion: number
  getNode: (id: string) => Konva.Group | undefined
  onTransformEnd: (id: string, scale: Vec2, rotation: number, center: Vec2) => void
}

const MIN_SIZE = 20

/**
 * Resize + rotate handles for the current single selection. The table is a Group
 * (no intrinsic size), so we report the scale factors and let the canvas apply
 * them to the stored size. Multi-select transform is deferred.
 */
export function SelectionTransformer({
  selectedIds,
  tablesVersion,
  getNode,
  onTransformEnd,
}: SelectionTransformerProps) {
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const node = selectedIds.length === 1 ? getNode(selectedIds[0]) : undefined
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedIds, tablesVersion, getNode])

  return (
    <Transformer
      ref={trRef}
      rotateEnabled
      rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
      anchorStroke="#737373"
      borderStroke="#737373"
      boundBoxFunc={(oldBox, newBox) =>
        newBox.width < MIN_SIZE || newBox.height < MIN_SIZE ? oldBox : newBox
      }
      onTransformEnd={() => {
        const node = trRef.current?.nodes()[0]
        if (!node) return
        const scale = { x: node.scaleX(), y: node.scaleY() }
        node.scaleX(1)
        node.scaleY(1)
        onTransformEnd(node.id(), scale, node.rotation(), {
          x: node.x(),
          y: node.y(),
        })
      }}
    />
  )
}
