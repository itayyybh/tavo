import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Dialog, Text } from '@/components/ui'
import { useReservationStore } from '@/stores'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import type { SheetRepackPlan } from '@/services/seating'
import type { ID } from '@/types'

interface SheetRepackDialogProps {
  open: boolean
  onClose: () => void
  plan: SheetRepackPlan
  /** Apply the whole plan (reshuffle + seat the unfittable bookings). */
  onApply: () => void
}

/**
 * Preview + confirm for a whole-sheet repack (Phase 12, A1). Lists every move —
 * seat the newly-fittable bookings, relocate the tentative holds in the way —
 * before anything is written. Booking-sheet only; applying just rewrites
 * assignments.
 */
export function SheetRepackDialog({ open, onClose, plan, onApply }: SheetRepackDialogProps) {
  const { t } = useTranslation('reservations')
  const floor = useSeatingFloor()
  const reservations = useReservationStore((s) => s.reservations)

  const tableLabel = useMemo(
    () => new Map<ID, string>(floor.tables.map((tbl) => [tbl.id, tbl.label])),
    [floor.tables],
  )
  const guestName = useMemo(
    () => new Map<ID, string>(reservations.map((r) => [r.id, r.guestName])),
    [reservations],
  )
  const seatedSet = useMemo(() => new Set(plan.seated), [plan.seated])
  const labels = (ids: ID[]) => ids.map((id) => tableLabel.get(id) ?? id).join(' + ')

  return (
    <Dialog open={open} onClose={onClose} title={t('sheetRepack.title')}>
      <div className="flex flex-col gap-4">
        <Text muted>{t('sheetRepack.body', { count: plan.seated.length })}</Text>

        <ol className="flex flex-col gap-1.5">
          {plan.moves.map((m) => {
            const seats = seatedSet.has(m.reservationId)
            const name = guestName.get(m.reservationId) ?? m.reservationId
            return (
              <li key={m.reservationId} className="flex items-start gap-2 text-sm text-ink">
                <span
                  className={
                    'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ' +
                    (seats ? 'bg-ink' : 'bg-muted')
                  }
                />
                <span className="break-words">
                  {seats
                    ? t('seating.repackSeat', { name, tables: labels(m.toTableIds) })
                    : t('seating.repackMove', {
                        name,
                        from: labels(m.fromTableIds),
                        to: labels(m.toTableIds),
                      })}
                </span>
              </li>
            )
          })}
        </ol>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('sheetRepack.cancel')}
          </Button>
          <Button
            onClick={() => {
              onApply()
              onClose()
            }}
          >
            {t('sheetRepack.apply')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
