import { useEffect, useRef } from 'react'
import { Transformer } from 'react-konva'
import type Konva from 'konva'
import type { Vec2 } from '@/types'

interface ZoneTransformerProps {
  selectedId: string | null
  zonesVersion: number
  getNode: (id: string) => Konva.Group | undefined
  onTransformEnd: (id: string, scale: Vec2, center: Vec2) => void
}

const MIN_SIZE = 80

/** Resize handles for the selected zone (no rotation — zones stay axis-aligned). */
export function ZoneTransformer({
  selectedId,
  zonesVersion,
  getNode,
  onTransformEnd,
}: ZoneTransformerProps) {
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const node = selectedId ? getNode(selectedId) : undefined
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, zonesVersion, getNode])

  return (
    <Transformer
      ref={trRef}
      rotateEnabled={false}
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
        onTransformEnd(node.id(), scale, { x: node.x(), y: node.y() })
      }}
    />
  )
}
