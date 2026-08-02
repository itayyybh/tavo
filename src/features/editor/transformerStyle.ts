import type Konva from 'konva'
import type { CanvasColors } from './hooks/useCanvasColors'

/**
 * Shared premium look for all transformers: small rounded white anchors with an
 * ink outline and a thin muted bounding border. Theme-aware (adapts to dark).
 */
export function transformerStyle(colors: CanvasColors) {
  return {
    anchorFill: colors.surface,
    anchorStroke: colors.ink,
    anchorStrokeWidth: 1.5,
    anchorSize: 9,
    anchorCornerRadius: 3,
    borderStroke: colors.muted,
    borderStrokeWidth: 1,
    borderDash: [4, 4],
    rotateAnchorOffset: 26,
    // Don't fold the shape's own stroke into the box, so padding stays predictable.
    ignoreStroke: true,
    // Anchors stay visually tiny (premium look) but grab ~20px wider on every
    // side of touch — hitStrokeWidth extends the hit region without touching
    // anchorSize, so the drawn handle never changes.
    anchorStyleFunc: (anchor: Konva.Rect) => {
      anchor.hitStrokeWidth(20)
    },
  }
}
