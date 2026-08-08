import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button, Text } from '@/components/ui'
import type { RepackPlan } from '@/services/seating'
import type { ID } from '@/types'

interface RepackSuggestionProps {
  plan: RepackPlan
  /** Table id → display label. */
  tableLabel: Map<ID, string>
  /** Reservation id → guest name. */
  guestName: Map<ID, string>
  /** Apply the whole plan (reshuffle + seat the target). */
  onApply: () => void
}

/**
 * Repack preview (Phase 12, Step 2). When no table fits a reservation, the
 * optimizer may still seat it by reshuffling other TENTATIVE bookings. This
 * previews that plan as a plain list of moves — seat the target, relocate the
 * bookings in the way — and applies it on confirm. Booking-sheet only: applying
 * just rewrites `assignedTableIds`; nothing physically moves.
 */
export function RepackSuggestion({
  plan,
  tableLabel,
  guestName,
  onApply,
}: RepackSuggestionProps) {
  const { t } = useTranslation('reservations')
  const labels = (ids: ID[]) => ids.map((id) => tableLabel.get(id) ?? id).join(' + ')
  const reshuffleCount = plan.moves.filter((m) => m.reservationId !== plan.target).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="mt-3 rounded-xl border border-ink bg-surface p-3 text-left"
    >
      <Text className="text-sm font-semibold text-ink">{t('seating.repackTitle')}</Text>
      <Text muted className="mt-0.5 text-xs">
        {t('seating.repackBody', { count: reshuffleCount })}
      </Text>

      <ol className="mt-2 flex flex-col gap-1.5">
        {plan.moves.map((m) => {
          const isTarget = m.reservationId === plan.target
          const name = guestName.get(m.reservationId) ?? m.reservationId
          return (
            <li key={m.reservationId} className="flex items-start gap-2 text-xs text-ink">
              <span
                className={
                  'mt-1 h-1.5 w-1.5 shrink-0 rounded-full ' +
                  (isTarget ? 'bg-ink' : 'bg-muted')
                }
              />
              <span className="break-words">
                {isTarget
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

      <Button size="sm" variant="primary" className="mt-3 w-full" onClick={onApply}>
        {t('seating.repackApply')}
      </Button>
    </motion.div>
  )
}
