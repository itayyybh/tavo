import type { HTMLAttributes } from 'react'
import { cn } from '@/utils'

/** Surface container with soft shadow and rounded corners. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-soft)]',
        className,
      )}
      {...props}
    />
  )
}
