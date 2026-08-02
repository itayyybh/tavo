import { useNow } from '@/hooks/useNow'
import { cn } from '@/utils'
import type { ReservationStatus } from '@/types'

/** Statuses where a countdown to arrival is meaningful (guest not yet here). */
const AWAITING: ReservationStatus[] = ['confirmed']

// Subtle text-only color tiers (see task spec).
function tierClass(diffMin: number): string {
  if (diffMin < 0) return 'text-red-500' // late
  if (diffMin <= 15) return 'text-orange-500' // 0–15m
  if (diffMin <= 30) return 'text-amber-500' // 15–30m
  return 'text-emerald-600' // >30m
}

interface CountdownProps {
  dateTime: string
  status: ReservationStatus
  className?: string
}

/**
 * Live "(+42m)" / "(-5m)" countdown beside a reservation time. Subscribes to the
 * shared clock so it re-renders on its own without touching the parent card.
 */
export function Countdown({ dateTime, status, className }: CountdownProps) {
  const now = useNow()
  if (!AWAITING.includes(status)) return null

  const target = new Date(dateTime).getTime()
  if (Number.isNaN(target)) return null

  const diffMin = Math.round((target - now) / 60_000)
  // Only meaningful near arrival: up to 60m early, and until 15m late.
  if (diffMin > 60 || diffMin <= -15) return null

  const label = `${diffMin >= 0 ? '+' : '−'}${Math.abs(diffMin)}m`

  return (
    <span
      className={cn('text-xs font-medium tabular-nums', tierClass(diffMin), className)}
    >
      {label}
    </span>
  )
}
