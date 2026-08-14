import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button, Panel, Text } from '@/components/ui'
import {
  useReservationStore,
  useDecisionLogStore,
  useToastStore,
  usePreviewStore,
  isPreviewed,
} from '@/stores'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { useEffectiveFloor } from '@/features/floor/hooks/useEffectiveFloor'
import {
  suggestSeating,
  explainNoFit,
  optimizeAssignments,
  type Suggestion,
} from '@/services/seating'
import type { ID, Reservation } from '@/types'
import { cn } from '@/utils'
import { RepackSuggestion } from './RepackSuggestion'
import { MiniFloor } from './MiniFloor'

interface SeatingPanelProps {
  reservation: Reservation
}

/**
 * Seating suggestions for the selected reservation (Phase 7). Ranks tables /
 * merges via the engine, explains each with reason chips, and reserves the
 * chosen option (assign ≠ seat — actual seating is Phase 8). The full decision
 * is logged on accept for the decision history / future AI.
 */
export function SeatingPanel({ reservation }: SeatingPanelProps) {
  const { t } = useTranslation('reservations')
  const floor = useSeatingFloor()
  const reservations = useReservationStore((s) => s.reservations)
  const assignTable = useReservationStore((s) => s.assignTable)
  const clearAssignment = useReservationStore((s) => s.clearAssignment)
  const logSuggestion = useDecisionLogStore((s) => s.logSuggestion)
  const recordAccept = useDecisionLogStore((s) => s.recordAccept)
  const logRepack = useDecisionLogStore((s) => s.logRepack)
  const notify = useToastStore((s) => s.notify)
  const previews = usePreviewStore((s) => s.previews)
  const togglePreview = usePreviewStore((s) => s.toggle)
  const clearPreviews = usePreviewStore((s) => s.clear)
  const effective = useEffectiveFloor()

  // Previews scoped to THIS booking (the store keeps only one booking's at a time,
  // but a preview left over from the Live Floor could belong to another).
  const myPreviews = useMemo(
    () => previews.filter((p) => p.reservationId === reservation.id),
    [previews, reservation.id],
  )

  // Labels + zone names for display, resolved once from the floor snapshot.
  const tableLabel = useMemo(
    () => new Map<ID, string>(floor.tables.map((t) => [t.id, t.label])),
    [floor.tables],
  )
  const zoneName = useMemo(
    () => new Map<ID, string>(floor.zones.map((z) => [z.id, z.name])),
    [floor.zones],
  )

  // Other reservations feed time-conflict detection.
  const others = useMemo(
    () => reservations.filter((r) => r.id !== reservation.id),
    [reservations, reservation.id],
  )
  const suggestions = useMemo(
    () => suggestSeating(reservation, floor, others),
    [reservation, floor, others],
  )
  const noFitReason = useMemo(
    () => (suggestions.length === 0 ? explainNoFit(reservation, floor, others) : null),
    [suggestions.length, reservation, floor, others],
  )

  // When nothing fits, try a repack: reshuffle other tentative bookings to free
  // a table for this party (Phase 12). Only computed in the no-fit case.
  const repackPlan = useMemo(
    () =>
      suggestions.length === 0
        ? optimizeAssignments(reservation, floor, reservations)
        : null,
    [suggestions.length, reservation, floor, reservations],
  )

  const guestName = useMemo(
    () => new Map<ID, string>(reservations.map((r) => [r.id, r.guestName])),
    [reservations],
  )

  // Apply a repack: relocate the displaced bookings and seat the target. Each is
  // a plain reservation reassignment (write-through); nothing physically moves.
  const applyRepack = () => {
    if (!repackPlan) return
    const targetMove = repackPlan.moves.find(
      (m) => m.reservationId === repackPlan.target,
    )
    // The target is the host's explicit choice → pinned (manual). The displaced
    // bookings were auto-held and stay reshuffleable (auto).
    for (const m of repackPlan.moves) {
      const source = m.reservationId === repackPlan.target ? 'manual' : 'auto'
      assignTable(m.reservationId, m.toTableIds, source)
    }
    // Record the repack as an override for the decision history (Phase 12).
    if (targetMove) {
      logRepack(
        reservation.id,
        reservation.partySize,
        reservation.estimatedDuration,
        targetMove.toTableIds,
      )
    }
    const moved = repackPlan.moves.filter(
      (m) => m.reservationId !== repackPlan.target,
    ).length
    notify(t('seating.repackApplied', { name: reservation.guestName, count: moved }))
  }

  const assigned = reservation.assignedTableIds ?? []
  const labelsFor = (ids: ID[]) => ids.map((id) => tableLabel.get(id) ?? id).join(' + ')

  const accept = (s: Suggestion) => {
    // Log the whole ranked set + the chosen option together, then reserve.
    const decisionId = logSuggestion(
      reservation.id,
      reservation.partySize,
      reservation.estimatedDuration,
      suggestions,
    )
    recordAccept(decisionId, s.candidate.tableIds)
    // Host explicitly chose this option → pin it (manual): the repack optimizer
    // and auto-assign must never silently relocate it.
    assignTable(reservation.id, s.candidate.tableIds, 'manual')
    // The booking is now really reserved — the hypothetical previews are moot.
    clearPreviews()
  }

  return (
    <Panel title={t('seating.title')}>
      {assigned.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
          <div className="min-w-0">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {t('seating.reserved')}
            </Text>
            <Text className="break-words text-sm font-medium text-ink">
              {labelsFor(assigned)}
            </Text>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => clearAssignment(reservation.id)}
          >
            {t('seating.clear')}
          </Button>
        </div>
      )}

      {myPreviews.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {t('seating.previewComparing', { count: myPreviews.length })}
            </Text>
            <Button size="sm" variant="ghost" onClick={clearPreviews}>
              {t('seating.previewClear')}
            </Button>
          </div>
          <MiniFloor effective={effective} tableTypes={floor.tableTypes} />
        </div>
      )}

      {suggestions.length === 0 ? (
        <div>
          <div className="rounded-lg border border-dashed border-line py-8 text-center">
            <Text className="font-medium text-ink">{t('seating.noFitTitle')}</Text>
            <Text muted className="mt-0.5 text-xs">
              {noFitReason
                ? t(noFitReason.key, noFitReason.params)
                : t('seating.noFitBody', { size: reservation.partySize })}
            </Text>
          </div>
          {repackPlan && (
            <RepackSuggestion
              plan={repackPlan}
              tableLabel={tableLabel}
              guestName={guestName}
              onApply={applyRepack}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {suggestions.map((s, i) => {
            const chosen =
              assigned.length > 0 &&
              labelsFor(assigned) === labelsFor(s.candidate.tableIds)
            return (
              <motion.div
                key={
                  s.candidate.tableIds.join('+') +
                  (s.candidate.relocateToZoneId ? ':bring' : '')
                }
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut', delay: i * 0.03 }}
                className={cn(
                  'rounded-xl border bg-surface p-3 transition-colors duration-200',
                  i === 0 ? 'border-ink' : 'border-line',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-words text-sm font-semibold text-ink">
                        {labelsFor(s.candidate.tableIds)}
                      </span>
                      {i === 0 && (
                        <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-surface">
                          {t('seating.best')}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      <span className="tabular-nums">
                        {t('seating.seatsParty', {
                          seats: s.candidate.seats,
                          party: reservation.partySize,
                        })}
                      </span>
                      {zoneName.get(s.candidate.zoneId) && (
                        <span> · {zoneName.get(s.candidate.zoneId)}</span>
                      )}
                    </div>
                    {s.candidate.relocateToZoneId && (
                      <div className="mt-1 text-[11px] font-medium text-ink">
                        {s.candidate.zoneId === s.candidate.relocateToZoneId
                          ? `Bring a table into ${zoneName.get(s.candidate.relocateToZoneId)}`
                          : `Bring from ${zoneName.get(s.candidate.zoneId)} → ${zoneName.get(s.candidate.relocateToZoneId)}`}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Button
                      size="sm"
                      variant={chosen ? 'secondary' : 'primary'}
                      disabled={chosen}
                      onClick={() => accept(s)}
                    >
                      {chosen ? t('seating.reservedBtn') : t('seating.reserve')}
                    </Button>
                    {(() => {
                      const previewing = isPreviewed(
                        previews,
                        reservation.id,
                        s.candidate.tableIds,
                      )
                      const color = myPreviews.find((p) =>
                        isPreviewed([p], reservation.id, s.candidate.tableIds),
                      )?.color
                      return (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            togglePreview(reservation.id, s.candidate.tableIds)
                          }
                        >
                          <span className="flex items-center gap-1.5">
                            {previewing && color && (
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            )}
                            {previewing
                              ? t('seating.previewing')
                              : t('seating.preview')}
                          </span>
                        </Button>
                      )
                    })()}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {s.reasons.map((reason) => (
                    <span
                      key={reason.key}
                      className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-muted"
                    >
                      {t(reason.key, reason.params)}
                    </span>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
