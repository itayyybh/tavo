import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const base =
  'hit-slop inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:pointer-events-none disabled:opacity-40'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-surface hover:bg-ink-soft',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink',
  danger: 'bg-status-occupied text-white hover:opacity-90',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
}

/** Primary interactive control. Minimal, premium, keyboard-accessible. */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props} />
  )
}
