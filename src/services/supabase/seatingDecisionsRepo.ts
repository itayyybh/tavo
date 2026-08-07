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
