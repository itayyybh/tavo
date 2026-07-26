import { cn } from '@/utils'
import type { TableStatus } from '@/types'

// Literal classes so Tailwind can statically detect them.
const dotClass: Record<TableStatus, string> = {
  available: 'bg-status-available',
  reserved: 'bg-status-reserved',
  occupied: 'bg-status-occupied',
  blocked: 'bg-status-blocked',
}

const label: Record<TableStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
  blocked: 'Blocked',
}

/** Table status pill — the single source of truth for status → color/label. */
export function StatusBadge({
  status,
  className,
}: {
  status: TableStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-soft',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[status])} />
      {label[status]}
    </span>
  )
}
