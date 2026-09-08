import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useReservationStore, useFloorStore, useToastStore } from '@/stores'
import { endOfDayArchivableIds } from '@/utils'

/** How often to re-check whether the service has ended (the trigger is time-based). */
const CHECK_MS = 60_000

/**
 * Automatic end-of-day reset. A past service day is swept the moment the clock
 * rolls past midnight (regardless of any party left seated overnight); today is
 * swept only once every booking is terminal AND the last window has passed. The
 * day's reservations move to History and ONLY their tables are freed on the Live
 * Floor — today's live seatings are spared — with zero host effort.
 *
 * The trigger is time-based, so it's re-checked both on every reservation change
 * and on a slow interval (a service can end simply because the clock moved past
 * the last booking, with no data change). The sweep is idempotent: once the
 * active set is archived the condition can't re-fire, so concurrent devices
 * converge rather than loop. Lives app-wide in `AuthGate`, beside the syncs.
 */
export function useEndOfDayReset() {
  const { t } = useTranslation('reservations')
  const reservations = useReservationStore((s) => s.reservations)

  useEffect(() => {
    const check = () => {
      // Read fresh from the store — the interval closure must not go stale.
      const active = useReservationStore.getState().reservations
      const ids = endOfDayArchivableIds(active)
      if (ids.length === 0) return
      useReservationStore.getState().archiveMany(ids, 'end_of_day')
      // Free only the swept parties' tables — today's live seatings survive a
      // past-day rollover (a party seated just after midnight is not wiped).
      useFloorStore.getState().sweepSeatings(ids)
      useToastStore.getState().notify(t('endOfDay.swept', { count: ids.length }))
    }
    check()
    const timer = setInterval(check, CHECK_MS)
    return () => clearInterval(timer)
  }, [reservations, t])
}
