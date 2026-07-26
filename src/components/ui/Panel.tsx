import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils'

interface PanelProps extends HTMLAttributes<HTMLElement> {
  title?: string
  actions?: ReactNode
}

/**
 * Sidebar / section container with an optional header row.
 * Used for editor panels, reservation lists, zone settings, etc.
 */
export function Panel({ title, actions, className, children, ...props }: PanelProps) {
  return (
    <section
      className={cn('flex flex-col rounded-xl border border-line bg-surface', className)}
      {...props}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="flex-1 p-4">{children}</div>
    </section>
  )
}
