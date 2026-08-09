import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useReservationStore, useDecisionLogStore, useToastStore } from '@/stores'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { planSheetRepack } from '@/services/seating'

/**
 * Whole-sheet repack (Phase 12, A1). Computes a combined plan that seats every
 * active booking a reshuffle can fit (direct fits stay Assign-all's job), for a
 * preview-then-apply flow. Applying rewrites the assignments as `auto` (still
 * reshuffleable) and logs each newly-seated booking as a repack override.
 */
export function useSheetRepack() {
  const { t } = useTranslation('reservations')
  const reservations = useReservationStore((s) => s.reservations)
  const assignTable = useReservationStore((s) => s.assignTable)
  const logRepack = useDecisionLogStore((s) => s.logRepack)
  const notify = useToastStore((s) => s.notify)
  const floor = useSeatingFloor()

  const plan = useMemo(
    () => planSheetRepack(reservations, floor),
    [reservations, floor],
  )

  const apply = useCallback(() => {
    for (const m of plan.moves) assignTable(m.reservationId, m.toTableIds, 'auto')
    const byId = new Map(reservations.map((r) => [r.id, r]))
    for (const id of plan.seated) {
      const r = byId.get(id)
      const move = plan.moves.find((m) => m.reservationId === id)
      if (r && move) logRepack(r.id, r.partySize, r.estimatedDuration, move.toTableIds)
    }
    if (plan.seated.length > 0) {
      notify(t('sheetRepack.applied', { count: plan.seated.length }))
    }
  }, [plan, assignTable, logRepack, notify, t, reservations])

  return { plan, repackableCount: plan.seated.length, apply }
}
