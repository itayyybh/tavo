/** Native 24h time input, styled to the design system. Empty value = "". */
export function TimeField({
  value,
  onChange,
  id,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  id?: string
  'aria-label'?: string
}) {
  return (
    <input
      type="time"
      id={id}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.currentTarget.value)}
      className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm tabular-nums text-ink transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
    />
  )
}
