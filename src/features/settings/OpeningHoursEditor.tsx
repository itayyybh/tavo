import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Toggle } from '@/components/ui'
import { useSettingsStore } from '@/stores'
import type { Weekday } from '@/types'
import { TimeField } from './TimeField'

const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/** Localised long weekday name. 2023-01-01 (UTC) was a Sunday, so it anchors 0. */
function weekdayLabel(weekday: Weekday, locale: string): string {
  const date = new Date(Date.UTC(2023, 0, 1 + weekday))
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(date)
}

/**
 * Weekly opening-hours editor (Phase 11 — Settings shell). One row per weekday:
 * an open/closed switch, service window, and an optional last-seating cutoff.
 * Every change writes straight to the settings store (autosaved to the DB).
 */
export function OpeningHoursEditor() {
  const { t } = useTranslation('settings')
  const locale = useSettingsStore((s) => s.locale)
  const openingHours = useSettingsStore((s) => s.openingHours)
  const setDayHours = useSettingsStore((s) => s.setDayHours)

  const labels = useMemo(
    () => WEEKDAYS.map((d) => weekdayLabel(d, locale)),
    [locale],
  )

  return (
    <div className="flex flex-col">
      {WEEKDAYS.map((day, i) => {
        const hours = openingHours[day]
        return (
          <div
            key={day}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0"
          >
            <div className="flex w-40 items-center gap-3">
              <Toggle
                checked={hours.open}
                onChange={(open) => setDayHours(day, { open })}
                aria-label={labels[i]}
              />
              <span className={hours.open ? 'text-sm text-ink' : 'text-sm text-muted'}>
                {labels[i]}
              </span>
            </div>

            {hours.open ? (
              <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                <TimeField
                  value={hours.from}
                  onChange={(from) => setDayHours(day, { from })}
                  aria-label={t('openingHours.from')}
                />
                <span className="text-muted">–</span>
                <TimeField
                  value={hours.to}
                  onChange={(to) => setDayHours(day, { to })}
                  aria-label={t('openingHours.to')}
                />
                <span className="ms-2 text-[13px] text-muted">
                  {t('openingHours.lastSeating')}
                </span>
                <TimeField
                  value={hours.lastSeating ?? ''}
                  onChange={(v) => setDayHours(day, { lastSeating: v || null })}
                  aria-label={t('openingHours.lastSeating')}
                />
              </div>
            ) : (
              <span className="text-[13px] text-muted">{t('openingHours.closed')}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
