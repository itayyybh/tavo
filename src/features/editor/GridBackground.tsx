import { Line } from 'react-konva'
import type { Viewport } from '@/stores/uiStore'

interface GridBackgroundProps {
  viewport: Viewport
  stageSize: { width: number; height: number }
  gridSize: number
  color: string
}

// Don't draw a grid so dense it hurts (i.e. when zoomed far out).
const MAX_LINES = 400

/** Infinite grid, drawn only for the currently visible world region. */
export function GridBackground({
  viewport,
  stageSize,
  gridSize,
  color,
}: GridBackgroundProps) {
  const { pan, zoom } = viewport
  const left = -pan.x / zoom
  const top = -pan.y / zoom
  const right = (stageSize.width - pan.x) / zoom
  const bottom = (stageSize.height - pan.y) / zoom

  const cols = (right - left) / gridSize
  const rows = (bottom - top) / gridSize
  if (cols > MAX_LINES || rows > MAX_LINES || cols <= 0 || rows <= 0) return null

  const startX = Math.floor(left / gridSize) * gridSize
  const startY = Math.floor(top / gridSize) * gridSize
  const strokeWidth = 1 / zoom

  const lines = []
  for (let x = startX; x <= right; x += gridSize) {
    lines.push(
      <Line
        key={`v${x}`}
        points={[x, top, x, bottom]}
        stroke={color}
        strokeWidth={strokeWidth}
        listening={false}
      />,
    )
  }
  for (let y = startY; y <= bottom; y += gridSize) {
    lines.push(
      <Line
        key={`h${y}`}
        points={[left, y, right, y]}
        stroke={color}
        strokeWidth={strokeWidth}
        listening={false}
      />,
    )
  }
  return <>{lines}</>
}
