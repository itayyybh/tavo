import type { ReactNode } from 'react'
import { cn } from '@/utils'

/** Uncontrolled text input that commits on blur/Enter and reverts empty to the
 * current value. `key` remounts it when the value changes externally (e.g. undo). */
export function TextField({
  value,
  onCommit,
  className,
}: {
  value: string
  onCommit: (v: string) => void
  className?: string
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      onBlur={(e) => onCommit(e.currentTarget.value.trim() || value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.currentTarget.value = value
          e.currentTarget.blur()
        }
      }}
      className={cn(
        'rounded border border-line bg-surface px-2 py-1 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-ink/20',
        className,
      )}
    />
  )
}

/** Uncontrolled number input; commits a clamped value on blur/Enter. */
export function NumField({
  value,
  min = 0,
  onCommit,
}: {
  value: number
  min?: number
  onCommit: (n: number) => void
}) {
  return (
    <input
      key={value}
      type="number"
      min={min}
      defaultValue={value}
      onBlur={(e) => {
        const n = Number(e.currentTarget.value)
        onCommit(Number.isFinite(n) ? Math.max(min, n) : value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className="w-full rounded border border-line bg-surface px-1.5 py-1 text-sm tabular-nums text-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
    />
  )
}

/** Small stacked label + control used across the editor panels. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted">
      {label}
      {children}
    </label>
  )
}
