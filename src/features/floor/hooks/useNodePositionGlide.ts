import { useEffect, useRef, type RefObject } from 'react'
import Konva from 'konva'

/** Glide duration for a table sliding to a new spot (seat / merge / split / restore). */
const DURATION = 0.22

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Glide a Konva group to a new center (x, y) when the position changes from the
 * store — so tables slide into a merged block, split back, or restore, instead of
 * teleporting. react-konva has already moved the node to the target by the time
 * this runs, so we snap it back to the previous spot and tween forward.
 *
 * A table whose id is in `dragIds` was just dropped by a drag — it's already at
 * the target, so its glide is skipped (and the id consumed) so it doesn't jump
 * back and re-slide. Rotation is intentionally NOT glided (a wrapped 90° turn
 * would spin the long way); react-konva snaps it.
 */
export function useNodePositionGlide(
  ref: RefObject<Konva.Node | null>,
  x: number,
  y: number,
  dragIds: RefObject<Set<string>>,
  id: string,
): void {
  const prev = useRef({ x, y })
  const tween = useRef<Konva.Tween | null>(null)

  useEffect(() => {
    const node = ref.current
    const from = prev.current
    prev.current = { x, y }
    // Consume a one-shot drag suppression for this table.
    const dragged = dragIds.current.has(id)
    if (dragged) dragIds.current.delete(id)
    if (!node) return
    if (from.x === x && from.y === y) return

    tween.current?.destroy()
    tween.current = null
    if (dragged || prefersReducedMotion()) return

    node.position(from)
    tween.current = new Konva.Tween({
      node,
      x,
      y,
      duration: DURATION,
      easing: Konva.Easings.EaseOut,
    })
    tween.current.play()
  }, [ref, x, y, dragIds, id])

  useEffect(() => () => tween.current?.destroy(), [])
}
