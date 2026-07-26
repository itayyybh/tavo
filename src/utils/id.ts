import type { ID } from '@/types'

/** Generate a unique id. Uses the platform crypto UUID when available. */
export function createId(): ID {
  return crypto.randomUUID()
}
