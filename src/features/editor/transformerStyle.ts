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
  }
}
