/**
 * Date/time helpers for the Reservation Engine.
 *
 * Reservations store a single canonical ISO datetime (`dateTime`). The UI splits
 * it into a date part and a time part for editing, then recombines. Keeping ONE
 * source of truth avoids date/time desync. All comparisons are local-time based
 * (the host works in the restaurant's own timezone).
 */

/** Local `YYYY-MM-DD` key for a Date — used for day-bucketing and `<input type="date">`. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Local `HH:mm` for a Date — used for `<input type="time">`. */
export function toTimeKey(date: Date): string {
  const h = `${date.getHours()}`.padStart(2, '0')
  const min = `${date.getMinutes()}`.padStart(2, '0')
  return `${h}:${min}`
}

/** Split an ISO datetime into `{ date: 'YYYY-MM-DD', time: 'HH:mm' }` for form fields. */
export function splitDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  return { date: toDateKey(d), time: toTimeKey(d) }
}

/** Combine a `YYYY-MM-DD` and `HH:mm` back into an ISO datetime. Empty parts → ''. */
export function combineDateTime(date: string, time: string): string {
  if (!date || !time) return ''
  const d = new Date(`${date}T${time}`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
}

/** True when an ISO string parses to a real date. */
export function isValidDateTime(iso: string): boolean {
  return !!iso && !Number.isNaN(new Date(iso).getTime())
}

/** Human arrival time in 24h, e.g. `19:30`. Empty string for invalid input. */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Human date, e.g. `Thu, Jul 30`. Empty string for invalid input. */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** Format minutes-since-midnight as `HH:mm` (used by the timeline + load chart). */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${`${h}`.padStart(2, '0')}:${`${m}`.padStart(2, '0')}`
}

/** Minutes since local midnight — used to place a reservation on the timeline. */
export function minutesOfDay(iso: string): number {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 0
  return d.getHours() * 60 + d.getMinutes()
}

/** Local day key for the start of today. */
export function todayKey(): string {
  return toDateKey(new Date())
}

/** Local day key for tomorrow. */
export function tomorrowKey(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toDateKey(d)
}

/** True when the ISO datetime falls on the given `YYYY-MM-DD` local day. */
export function isOnDay(iso: string, dayKey: string): boolean {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return toDateKey(d) === dayKey
}
