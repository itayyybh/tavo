import type { HTMLAttributes } from 'react'
import { cn } from '@/utils'

/** Small neutral label chip. For status use StatusBadge. */
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink-soft',
        className,
      )}
      {...props}
    />
  )
}
