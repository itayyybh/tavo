import { describe, it, expect } from 'vitest'
import { clampPan, type Bounds } from './geometry'

const SIZE = { width: 1000, height: 800 }
// Content larger than the viewport in both axes, so panning is genuinely bounded.
const BOUNDS: Bounds = { x: 0, y: 0, width: 2000, height: 1600 }
const MARGIN = Math.min(SIZE.width, SIZE.height) / 2 // 400

describe('clampPan', () => {
  it('leaves an in-range pan untouched', () => {
    const pan = { x: -200, y: -150 }
    expect(clampPan(pan, BOUNDS, SIZE, 1, MARGIN)).toEqual(pan)
  })

  it('stops the content from scrolling off to the left/up', () => {
    // Far negative pan pushes content up-left off screen; clamp holds the far
    // edge `MARGIN` px inside the viewport.
    const clamped = clampPan({ x: -100000, y: -100000 }, BOUNDS, SIZE, 1, MARGIN)
    // minX = margin - (x+width)*zoom = 400 - 2000 = -1600
    expect(clamped.x).toBe(-1600)
    expect(clamped.y).toBe(400 - 1600) // -1200
  })

  it('stops the content from scrolling off to the right/down', () => {
    const clamped = clampPan({ x: 100000, y: 100000 }, BOUNDS, SIZE, 1, MARGIN)
    // maxX = size.width - margin - x*zoom = 1000 - 400 - 0 = 600
    expect(clamped.x).toBe(600)
    expect(clamped.y).toBe(800 - 400) // 400
  })

  it('scales the limits with zoom', () => {
    const clamped = clampPan({ x: -100000, y: 0 }, BOUNDS, SIZE, 2, MARGIN)
    // minX = 400 - (2000 * 2) = -3600
    expect(clamped.x).toBe(-3600)
  })

  it('is a no-op when there is no content', () => {
    const pan = { x: 5000, y: 5000 }
    expect(clampPan(pan, null, SIZE, 1, MARGIN)).toEqual(pan)
  })
})
