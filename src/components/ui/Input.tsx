import { useId, type InputHTMLAttributes } from 'react'
import { cn } from '@/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const fieldClass =
  'h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:opacity-40'

/** Labeled text input with optional inline error. */
export function Input({ label, error, id, className, ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(fieldClass, error && 'border-status-occupied', className)}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && <span className="text-xs text-status-occupied">{error}</span>}
    </div>
  )
}
