import type { ReservationOccasion, ReservationSource } from '@/types'
import { isValidDateTime } from './datetime'

/**
 * Reservation validation — never silently fails; every rule maps to a helpful,
 * field-level message. Duplicate detection is a separate soft warning (see
 * `findDuplicate`), not an error, so it never blocks the host.
 */

/** The editable shape of a reservation (form draft), independent of stored metadata. */
export interface ReservationDraft {
  guestName: string
  phone: string
  email: string
  partySize: number
  /** Canonical ISO datetime built from the form's date + time fields. */
  dateTime: string
  estimatedDuration: number
  preferredZoneId?: string
  preferredTableId?: string
  occasion?: ReservationOccasion
  source: ReservationSource
  notes: string
}

export type ReservationErrorField =
  | 'guestName'
  | 'partySize'
  | 'dateTime'
  | 'phone'
  | 'email'
  | 'estimatedDuration'

export type ReservationErrors = Partial<Record<ReservationErrorField, string>>

// Lenient phone: digits with optional +, spaces, dashes, parens; at least 7 digits.
const PHONE_RE = /^[+]?[\d\s().-]{7,}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateReservation(draft: ReservationDraft): ReservationErrors {
  const errors: ReservationErrors = {}

  if (!draft.guestName.trim()) {
    errors.guestName = 'Guest name is required.'
  }

  if (!Number.isFinite(draft.partySize) || draft.partySize <= 0) {
    errors.partySize = 'Party size must be at least 1.'
  }

  if (!isValidDateTime(draft.dateTime)) {
    errors.dateTime = 'Choose a valid date and time.'
  }

  if (
    !Number.isFinite(draft.estimatedDuration) ||
    draft.estimatedDuration <= 0
  ) {
    errors.estimatedDuration = 'Duration must be a positive number of minutes.'
  }

  const phone = draft.phone.trim()
  if (phone && !PHONE_RE.test(phone)) {
    errors.phone = 'Enter a valid phone number.'
  }

  const email = draft.email.trim()
  if (email && !EMAIL_RE.test(email)) {
    errors.email = 'Enter a valid email address.'
  }

  return errors
}

/** True when a validation result has no errors. */
export function isValidDraft(errors: ReservationErrors): boolean {
  return Object.keys(errors).length === 0
}
