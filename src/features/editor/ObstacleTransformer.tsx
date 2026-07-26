import { useEffect, useRef } from 'react'
import { Transformer } from 'react-konva'
import type Konva from 'konva'
import type { Vec2 } from '@/types'
import type { CanvasColors } from './hooks/useCanvasColors'
import { transformerStyle } from './transformerStyle'

interface ObstacleTransformerProps {
  selectedId: string | null
  obstaclesVersion: number
  colors: CanvasColors
  getNode: (id: string) => Konva.Node | undefined
  onTransformEnd: (id: string, size: Vec2, center: Vec2, rotation: number) => void
}

const MIN_SIZE = 10

/** Resize + rotate handles for the selected obstacle (walls need sizing). */
export function ObstacleTransformer({
  selectedId,
  obstaclesVersion,
  colors,
  getNode,
  onTransformEnd,
}: ObstacleTransformerProps) {
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const node = selectedId ? getNode(selectedId) : undefined
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, obstaclesVersion, getNode])

  return (
    <Transformer
      ref={trRef}
      rotateEnabled
      rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
      padding={4}
      {...transformerStyle(colors)}
      boundBoxFunc={(oldBox, newBox) =>
        newBox.width < MIN_SIZE || newBox.height < MIN_SIZE ? oldBox : newBox
      }
      onTransformEnd={() => {
        const node = trRef.current?.nodes()[0]
        if (!node) return
        const scaleX = node.scaleX()
        const scaleY = node.scaleY()
        // Normalize scale into concrete size.
        let width: number
        let height: number
        if (node.getClassName() === 'Circle') {
          const circle = node as Konva.Circle
          const d = circle.radius() * 2 * scaleX
          width = d
          height = d
        } else {
          width = node.width() * scaleX
          height = node.height() * scaleY
        }
        node.scaleX(1)
        node.scaleY(1)
        onTransformEnd(
          node.id(),
          { x: width, y: height },
          { x: node.x(), y: node.y() },
          node.rotation(),
        )
      }}
    />
  )
}
