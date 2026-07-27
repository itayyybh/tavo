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
// Finest on-screen spacing (px) before we coarsen the grid — keeps it legible on
// small/half-size viewports and when zoomed out.
const MIN_SPACING_PX = 8
// Every Nth line is a stronger "major" line for structure.
const MAJOR_EVERY = 5

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

  // Coarsen the step (doubling) until minor lines stay above the legibility floor.
  let step = gridSize
  while (step * zoom < MIN_SPACING_PX) step *= 2

  const cols = (right - left) / step
  const rows = (bottom - top) / step
  if (cols > MAX_LINES || rows > MAX_LINES || cols <= 0 || rows <= 0) return null

  const startX = Math.floor(left / step) * step
  const startY = Math.floor(top / step) * step
  const minorWidth = 1 / zoom
  const majorWidth = 1.25 / zoom

  const isMajor = (v: number) => {
    const n = Math.round(v / step)
    return ((n % MAJOR_EVERY) + MAJOR_EVERY) % MAJOR_EVERY === 0
  }

  const lines = []
  for (let x = startX; x <= right; x += step) {
    const major = isMajor(x)
    lines.push(
      <Line
        key={`v${x}`}
        points={[x, top, x, bottom]}
        stroke={color}
        strokeWidth={major ? majorWidth : minorWidth}
        opacity={major ? 1 : 0.45}
        listening={false}
      />,
    )
  }
  for (let y = startY; y <= bottom; y += step) {
    const major = isMajor(y)
    lines.push(
      <Line
        key={`h${y}`}
        points={[left, y, right, y]}
        stroke={color}
        strokeWidth={major ? majorWidth : minorWidth}
        opacity={major ? 1 : 0.45}
        listening={false}
      />,
    )
  }
  return <>{lines}</>
}
