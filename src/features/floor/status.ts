import type { FloorTableStatus } from '@/types'

/** Human labels for the Live Floor's effective table statuses. */
export const statusLabel: Record<FloorTableStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
  cleaning: 'Cleaning',
  blocked: 'Blocked',
}
