import { FloorCanvas } from '@/features/floor'

/**
 * Live Floor — top-down operational view of the restaurant (Phase 8).
 * Reads the effective floor (base layout + runtime shift overrides) and renders
 * it read-only. Seating, drag-to-assign and operational merges arrive in later
 * steps; this is the renderer foundation.
 */
export default function FloorPage() {
  return <FloorCanvas />
}
