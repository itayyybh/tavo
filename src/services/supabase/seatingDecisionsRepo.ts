import type { ID, SeatingDecision } from '@/types'
import { supabase } from './client'
import {
  seatingDecisionFromRow,
  seatingDecisionToRow,
  type SeatingDecisionRow,
} from './mappers'

/**
 * Seating decisions repository (Phase 11 — AI preparation).
 *
 * Persists the engine's decision log so it survives reloads and becomes durable
 * decision history. Append-only: a decision is written once, when the host
 * accepts a suggestion. RLS is the real tenant guard; scoping by `restaurantId`
 * keeps queries explicit and payloads small.
 */

/** Insert one accepted seating decision. The row carries a client-minted id. */
export async function insertSeatingDecision(
  restaurantId: ID,
  decision: SeatingDecision,
): Promise<void> {
  const { error } = await supabase
    .from('seating_decisions')
    .insert(seatingDecisionToRow(restaurantId, decision))
  if (error) throw error
}

/**
 * Stamp the real seated duration onto a reservation's accepted decision (P3 —
 * outcome recording). Targets the latest *accepted* decision (`chosen not null`)
 * for the reservation; a manual seat that never ran the engine has no such row
 * and this no-ops.
 *
 * PostgREST can't order+limit an UPDATE inline, so we resolve the target id
 * first, then patch by id — two round-trips, fire-and-forget from the store.
 */
export async function recordDecisionOutcome(
  restaurantId: ID,
  reservationId: ID,
  actualMinutes: number,
): Promise<void> {
  const { data, error } = await supabase
    .from('seating_decisions')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('reservation_id', reservationId)
    .not('chosen', 'is', null)
    .order('ts', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return
  const { error: updateError } = await supabase
    .from('seating_decisions')
    .update({ actual_minutes: actualMinutes })
    .eq('id', (data as { id: string }).id)
  if (updateError) throw updateError
}

/** Recent decisions for a restaurant, newest first (audit / future training data). */
export async function listSeatingDecisions(
  restaurantId: ID,
  limit = 200,
): Promise<SeatingDecision[]> {
  const { data, error } = await supabase
    .from('seating_decisions')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('ts', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as SeatingDecisionRow[]).map(seatingDecisionFromRow)
}
