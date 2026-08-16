import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  Heading,
  Input,
  ReservationStatusBadge,
  Text,
} from '@/components/ui'
import { useReservationStore } from '@/stores'
import type { Reservation } from '@/types'
import { formatDate, formatTime, matchesQuery, serviceDayOf } from '@/utils'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'

/** A service day and its archived reservations, newest booking first. */
interface DayGroup {
  day: string
  label: string
  items: Reservation[]
}

/**
 * History surface — reservations archived by a host delete or the end-of-day
 * sweep. Grouped by service day (newest first), searchable, with per-row
 * Restore (back into the live service, unassigned) and a permanent purge. Reads
 * the archive bucket the reservation store keeps apart from the active service.
 */
export function HistoryView() {
  const { t } = useTranslation('reservations')
  const archived = useReservationStore((s) => s.archived)
  const restore = useReservationStore((s) => s.restoreReservation)
  const hardDelete = useReservationStore((s) => s.hardDelete)
  const clearArchived = useReservationStore((s) => s.clearArchived)

  const [query, setQuery] = useState('')
  const [purgeTarget, setPurgeTarget] = useState<Reservation | null>(null)
  const [clearAllOpen, setClearAllOpen] = useState(false)

  const groups = useMemo<DayGroup[]>(() => {
    const filtered = archived.filter((r) => matchesQuery(r, query))
    const byDay = new Map<string, Reservation[]>()
    for (const r of filtered) {
      const day = serviceDayOf(r)
      const list = byDay.get(day)
      if (list) list.push(r)
      else byDay.set(day, [r])
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1)) // newest day first
      .map(([day, items]) => ({
        day,
        label: formatDate(items[0].dateTime),
        items: items.sort((a, b) => Date.parse(b.dateTime) - Date.parse(a.dateTime)),
      }))
  }, [archived, query])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-end justify-between gap-3">
        <Heading level={1}>{t('history.title')}</Heading>
        <div className="flex items-center gap-3">
          <Text muted className="text-sm tabular-nums">
            {t('history.count', { count: archived.length })}
          </Text>
          {archived.length > 0 && (
            <Button variant="danger" size="sm" onClick={() => setClearAllOpen(true)}>
              {t('history.clearAll')}
            </Button>
          )}
        </div>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('history.searchPlaceholder')}
      />

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line py-16 text-center">
          <Text className="font-medium text-ink">{t('history.emptyTitle')}</Text>
          <Text muted className="mt-0.5 text-xs">
            {t('history.emptyBody')}
          </Text>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.day} className="flex flex-col gap-2">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {group.label}
              </Text>
              <ul className="flex flex-col gap-1.5">
                {group.items.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">
                          {r.guestName}
                        </span>
                        <ReservationStatusBadge status={r.status} />
                        <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-muted">
                          {t(`history.reason.${r.archiveReason ?? 'deleted'}`)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted tabular-nums">
                        {t('history.partyAt', {
                          size: r.partySize,
                          time: formatTime(r.dateTime),
                        })}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => restore(r.id)}>
                        {t('history.restore')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPurgeTarget(r)}
                      >
                        {t('history.deleteForever')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <DeleteConfirmDialog
        reservation={purgeTarget}
        permanent
        onClose={() => setPurgeTarget(null)}
        onConfirm={hardDelete}
      />

      <Dialog
        open={clearAllOpen}
        onClose={() => setClearAllOpen(false)}
        title={t('history.clearAllConfirm.title')}
      >
        <div className="flex flex-col gap-5">
          <Text muted>
            {t('history.clearAllConfirm.body', { count: archived.length })}
          </Text>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setClearAllOpen(false)}>
              {t('history.clearAllConfirm.keep')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                clearArchived()
                setClearAllOpen(false)
              }}
            >
              {t('history.clearAllConfirm.confirm')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
