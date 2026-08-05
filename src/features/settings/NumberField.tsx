interface NumberFieldProps {
  value: number
  onCommit: (n: number) => void
  min?: number
  max?: number
  /** Trailing unit label (e.g. "min", "u"). */
  suffix?: string
  id?: string
}

/**
 * Uncontrolled numeric input that commits a clamped value on blur/Enter. `key`
 * remounts it when the value changes elsewhere (e.g. a DB hydration) so the field
 * reflects the store. Sized to the design system, with an optional unit suffix.
 */
export function NumberField({ value, onCommit, min = 0, max, suffix, id }: NumberFieldProps) {
  const commit = (raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    let next = Math.max(min, n)
    if (max != null) next = Math.min(max, next)
    if (next !== value) onCommit(next)
  }
  return (
    <div className="flex items-center gap-2">
      <input
        key={value}
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        defaultValue={value}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            e.currentTarget.value = String(value)
            e.currentTarget.blur()
          }
        }}
        className="h-9 w-20 rounded-lg border border-line bg-surface px-2.5 text-sm tabular-nums text-ink transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
      />
      {suffix && <span className="text-[13px] text-muted">{suffix}</span>}
    </div>
  )
}
