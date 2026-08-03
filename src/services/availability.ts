import type { ID, Reservation, ReservationPreferences } from '@/types'
import { explainNoFit, suggestSeating, type SeatingFloor } from '@/services/seating'

/**
 * Availability check (Phase 9) — the gate the reservation-create flow calls.
 *
 * Business rule: it answers ONLY for the selected zone. A zone with no fitting
 * table/merge at the requested time is reported unavailable; it never silently
 * spills the party into another area or onto another table — the host chooses an
 * alternative explicitly.
 *
 * The check is intentionally isolated behind one async function so it can move
 * to a Supabase Edge Function (backend as final authority) without touching any
 * caller — only the body below changes.
 */

export interface AvailabilityInput {
  partySize: number
  /** ISO datetime of arrival. */
  dateTime: string
  /** Expected duration in minutes. */
  estimatedDuration: number
  /** The area the guest asked for — the only zone considered. */
  zoneId: ID
  preferences?: ReservationPreferences
}

export interface AvailabilityResult {
  available: boolean
  /** Host-readable reason when unavailable (for context; the UI leads with the rule). */
  reason?: string
}

/** Build the throwaway reservation the engine reasons over. */
function probeReservation(input: AvailabilityInput): Reservation {
  return {
    id: '__availability_probe__',
    guestName: '',
    partySize: input.partySize,
    dateTime: input.dateTime,
    estimatedDuration: input.estimatedDuration,
    preferredZoneId: input.zoneId,
    status: 'pending',
    source: 'phone',
    preferences: input.preferences,
    createdAt: '',
    updatedAt: '',
  }
}

/**
 * Run the check against a floor snapshot + the existing reservations. A zone is
 * available when the engine finds at least one feasible option genuinely IN that
 * zone (not relocated from elsewhere) at the requested time.
 */
export async function checkAvailability(
  input: AvailabilityInput,
  floor: SeatingFloor,
  others: Reservation[],
): Promise<AvailabilityResult> {
  const probe = probeReservation(input)
  const suggestions = suggestSeating(probe, floor, others, 50)
  const inZone = suggestions.filter(
    (s) => s.candidate.zoneId === input.zoneId && !s.candidate.relocateToZoneId,
  )
  if (inZone.length > 0) return { available: true }
  return { available: false, reason: explainNoFit(probe, floor, others) }
}
