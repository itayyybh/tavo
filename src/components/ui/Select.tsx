import { useId, type SelectHTMLAttributes } from 'react'
import { cn } from '@/utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: SelectOption[]
  /** Optional leading empty option. */
  placeholder?: string
}

const fieldClass =
  'h-10 w-full appearance-none rounded-xl border border-line bg-surface ps-3 pe-9 text-sm text-ink transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:opacity-40'

/** Labeled native select, styled to match Input. Native for accessibility + speed. */
export function Select({
  label,
  error,
  options,
  placeholder,
  id,
  className,
  ...props
}: SelectProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cn(fieldClass, error && 'border-status-occupied', className)}
          aria-invalid={error ? true : undefined}
          {...props}
        >
          {placeholder != null && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {error && <span className="text-xs text-status-occupied">{error}</span>}
    </div>
  )
}
