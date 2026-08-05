import { cn } from '@/utils'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name when no visible label wraps the control. */
  'aria-label'?: string
  disabled?: boolean
  id?: string
}

/**
 * Minimal B&W switch (design system). A native-button `role="switch"` so it's
 * keyboard- and screen-reader-accessible out of the box. The knob slides with a
 * short ease-out transition per the animation rules.
 */
export function Toggle({ checked, onChange, disabled, id, ...aria }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={aria['aria-label']}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:opacity-40',
        checked ? 'bg-ink' : 'bg-line',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-surface shadow-sm transition-transform duration-200 ease-out',
          checked ? 'translate-x-[18px] rtl:-translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
