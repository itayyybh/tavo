import type { Weekday } from '@/types'

/** All weekdays, Sunday-first (0 = Sunday … 6 = Saturday). */
export const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/**
 * Localised long weekday name. 2023-01-01 (UTC) was a Sunday, so it anchors 0.
 * Shared by the opening-hours and recurring-closure editors.
 */
export function weekdayLabel(weekday: Weekday, locale: string): string {
  const date = new Date(Date.UTC(2023, 0, 1 + weekday))
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(date)
}
