import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui'
import { useLayoutStore, useReservationStore } from '@/stores'
import { isOnDay, sortReservations, todayKey } from '@/utils'
import type { ID, Reservation } from '@/types'

/**
 * Read-only "today" list for the phone. Shows each of today's reservations
 * time-ordered with its seating assignment (`assignedTableIds`), so a host on
 * the floor can see who sits where without the desktop app. No engine calls —
 * the assignment already lives on the reservation.
 */
export function MobileTodayList() {
  const { t } = useTranslation('reservations')
  const reservations = useReservationStore((s) => s.reservations)
  const tables = useLayoutStore((s) => s.tables)
  const zones = useLayoutStore((s) => s.zones)

  const tableLabels = useMemo(
    () => new Map<ID, string>(tables.map((t) => [t.id, t.label])),
    [tables],
  )
  const zoneNames = useMemo(
    () => new Map<ID, string>(zones.map((z) => [z.id, z.name])),
    [zones],
  )

  const today = useMemo(() => {
    const key = todayKey()
    const mine = reservations.filter((r) => isOnDay(r.dateTime, key))
    return sortReservations(mine, 'time', 'asc')
  }, [reservations])

  if (today.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
        <Text className="font-medium text-ink">{t('mobile.todayEmpty')}</Text>
        <Text muted>{t('mobile.todayEmptyBody')}</Text>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-2 overflow-y-auto px-5 py-5">
      {today.map((r) => (
        <TodayRow
          key={r.id}
          reservation={r}
          tableLabels={tableLabels}
          zoneName={r.preferredZoneId ? zoneNames.get(r.preferredZoneId) : undefined}
        />
      ))}
    </div>
  )
}

function TodayRow({
  reservation: r,
  tableLabels,
  zoneName,
}: {
  reservation: Reservation
  tableLabels: Map<ID, string>
  zoneName?: string
}) {
  const { t } = useTranslation('reservations')
  const time = new Date(r.dateTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  const assigned = r.assignedTableIds?.map((id) => tableLabels.get(id) ?? id).join(' + ')

  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-base font-medium text-ink">{r.guestName}</span>
        <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
          {time}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
        <span>{t('card.guest', { count: r.partySize })}</span>
        {zoneName && (
          <>
            <span>·</span>
            <span className="truncate">{zoneName}</span>
          </>
        )}
      </div>
      <div className="mt-2.5">
        {assigned ? (
          <span className="inline-flex items-center rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-surface">
            {t('mobile.todayTable', { labels: assigned })}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-medium text-muted">
            {t('mobile.todayUnassigned')}
          </span>
        )}
      </div>
    </div>
  )
}
