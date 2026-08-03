/** Small helpers for the mobile reservation flow. */

/** Local date as `YYYY-MM-DD` (native date input value). */
export function todayLocalDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Next round hour as `HH:MM` (native time input value) — a sensible default arrival. */
export function nextHourTime(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const h = (d.getHours() + 1) % 24
  return `${p(h)}:00`
}

/** Compose a local date + time into an ISO datetime string. */
export function toISODateTime(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString()
}

/** Duration presets (minutes) offered as chips, always including the default. */
export function durationOptions(defaultMinutes: number): number[] {
  const base = [60, 90, 120, 150, 180]
  return base.includes(defaultMinutes)
    ? base
    : [...base, defaultMinutes].sort((a, b) => a - b)
}

/** Human label for a minute duration, e.g. 90 -> "1h 30m", 120 -> "2h". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
