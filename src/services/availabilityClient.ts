import { supabase } from './supabase/client'
import {
  checkAvailability,
  type AvailabilityInput,
  type AvailabilityResult,
} from './availability'
import type { Reservation } from '@/types'
import type { SeatingFloor } from './seating'

/**
 * Client-side availability caller (Phase 9). Kept SEPARATE from `availability.ts`
 * so the pure engine check can be bundled for the server without dragging the
 * browser Supabase client (and its env-var guard) into the Edge Function bundle.
 */

/** Ask the Edge Function (server authority). Throws if it's unreachable. */
export async function checkAvailabilityRemote(
  input: AvailabilityInput,
): Promise<AvailabilityResult> {
  const { data, error } = await supabase.functions.invoke('check-availability', {
    body: input,
  })
  if (error) throw error
  return data as AvailabilityResult
}

/**
 * Prefer the server (final authority); fall back to the local engine if the
 * function is unreachable (e.g. not yet deployed, or offline) so the flow keeps
 * working. Once deployed, the server answer wins.
 */
export async function checkAvailabilitySmart(
  input: AvailabilityInput,
  floor: SeatingFloor,
  others: Reservation[],
): Promise<AvailabilityResult> {
  try {
    return await checkAvailabilityRemote(input)
  } catch (err) {
    console.warn('Remote availability unavailable, using local check.', err)
    return checkAvailability(input, floor, others)
  }
}
