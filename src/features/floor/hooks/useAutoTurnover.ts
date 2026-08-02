import { useEffect } from 'react'
import { useNow } from '@/hooks/useNow'
import { useFloorStore, useSettingsStore } from '@/stores'

/**
 * Auto-turnover (Phase 8, Step 3): once a cleaning table has sat in turnover for
 * `seating.turnoverBufferMin`, return it to available on its own. Driven by the
 * shared 30s wall-clock. Manual finish-cleaning still works regardless; flipping
 * `autoTurnover` off in settings leaves turnover fully manual.
 */
export function useAutoTurnover() {
  const now = useNow()
  const autoTurnover = useSettingsStore((s) => s.autoTurnover)
  const bufferMin = useSettingsStore((s) => s.seating.turnoverBufferMin)
  const cleaningSince = useFloorStore((s) => s.cleaningSince)
  const finishCleaning = useFloorStore((s) => s.finishCleaning)

  useEffect(() => {
    if (!autoTurnover) return
    const bufferMs = bufferMin * 60_000
    for (const [id, since] of Object.entries(cleaningSince)) {
      const t = Date.parse(since)
      if (!Number.isNaN(t) && now - t >= bufferMs) finishCleaning(id)
    }
  }, [now, autoTurnover, bufferMin, cleaningSince, finishCleaning])
}
