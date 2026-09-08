import type { TableUrgency } from '@/services/floor'
import type { FloorCanvasColors } from './hooks/useFloorColors'

/**
 * Reserved-table urgency ramp: as a booking nears, deepen the body tint and
 * thicken the border while walking the color UP its own violet scale (see
 * `--color-urgency-*`). The color is deliberately NOT a status hue — a nearing
 * reserved table must never read as occupied (red) or cleaning (amber). `far`
 * (>~30m out) stays plain reserved blue. Static — no motion — so a busy floor
 * stays legible. Shared by the single table (`FloorTableNode`) and merged hulls
 * (`MergedHulls`) so both escalate identically.
 */
export const RESERVED_RAMP: Record<'far' | TableUrgency, { tint: number; border: number }> = {
  far: { tint: 0, border: 0 },
  soon: { tint: 0.03, border: 0 },
  due: { tint: 0.07, border: 0.5 },
  imminent: { tint: 0.13, border: 0.75 },
  overdue: { tint: 0.18, border: 1 },
}

/**
 * Resolve the ramp color for an urgency step: `far` holds plain reserved blue,
 * every graded step reads from the dedicated urgency scale.
 */
export function rampColor(step: 'far' | TableUrgency, colors: FloorCanvasColors): string {
  return step === 'far' ? colors.status.reserved : colors.urgency[step]
}

/** Escalation order, least → most pressing. */
const URGENCY_RANK: Record<TableUrgency, number> = {
  soon: 1,
  due: 2,
  imminent: 3,
  overdue: 4,
}

/**
 * The most pressing urgency across a merged group's members — a merge escalates
 * with whichever bound booking is nearest. `far` (undefined on every member)
 * when nothing is pending.
 */
export function dominantUrgency(urgencies: Array<TableUrgency | undefined>): 'far' | TableUrgency {
  let best: TableUrgency | undefined
  for (const u of urgencies) {
    if (u && (!best || URGENCY_RANK[u] > URGENCY_RANK[best])) best = u
  }
  return best ?? 'far'
}
