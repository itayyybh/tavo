import { useEffect, useRef, type RefObject } from 'react'
import Konva from 'konva'

/** Tween duration + easing for a Live Floor status change (subtle, ease-out). */
const DURATION = 0.2

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Smoothly tween a Konva shape's `fill` (and optional `stroke`) whenever the
 * target color changes — used so a table's status color eases between states
 * (available → reserved → occupied → cleaning) instead of snapping.
 *
 * react-konva has already set the shape to the NEW color by the time this effect
 * runs, so we reset it to the PREVIOUS color and tween forward to the new one.
 * The first render never animates (prev === next), and reduced-motion users get
 * the instant color react-konva already applied.
 */
export function useNodeColorTween(
  ref: RefObject<Konva.Shape | null>,
  fill: string,
  stroke?: string,
): void {
  const prevFill = useRef(fill)
  const prevStroke = useRef(stroke)
  const tween = useRef<Konva.Tween | null>(null)

  useEffect(() => {
    const node = ref.current
    const fromFill = prevFill.current
    const fromStroke = prevStroke.current
    prevFill.current = fill
    prevStroke.current = stroke
    if (!node) return
    if (fromFill === fill && fromStroke === stroke) return

    tween.current?.destroy()
    tween.current = null
    if (prefersReducedMotion()) return // react-konva already applied the target

    node.fill(fromFill)
    if (fromStroke != null) node.stroke(fromStroke)
    tween.current = new Konva.Tween({
      node,
      fill,
      ...(stroke != null ? { stroke } : {}),
      duration: DURATION,
      easing: Konva.Easings.EaseOut,
    })
    tween.current.play()
  }, [ref, fill, stroke])

  // Kill any in-flight tween on unmount.
  useEffect(() => () => tween.current?.destroy(), [])
}
