/** Locale config — pure constants/helpers, no side effects (safe for stores to import). */

/** Supported locales. Add a code here + a matching locale folder to grow the set. */
export const LOCALES = ['en', 'he'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Locales that read right-to-left. Drives `<html dir>` and layout mirroring. */
const RTL_LOCALES = new Set<Locale>(['he'])

/** Text direction for a locale — `rtl` for Hebrew, `ltr` otherwise. */
export const dirForLocale = (locale: Locale): 'ltr' | 'rtl' =>
  RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
