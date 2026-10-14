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
 * decision history. RLS is the real tenant guard; scoping by `restaurantId`
 * keeps queries explicit and payloads small.
 *
 * A row is written when the engine PRODUCES suggestions, not when the host
 * accepts one, and updated in place if an acceptance follows. Writing only on
 * acceptance made abandoned suggestion runs invisible: a run the host ignored —
 * precisely the case where the engine offered nothing usable — left no trace,
 * so the log could never show where the engine failed to help.
 *
 * A row with `chosen is null` therefore means "suggested, nothing taken".
 */

/** Insert a decision as soon as the engine produces it. Client-minted id. */
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
 * Write the host's acceptance onto a decision.
 *
 * An upsert rather than an update: `logSuggestion` fires its insert and forgets
 * it, so that write may have failed or still be in flight. Upserting the whole
 * decision makes acceptance correct either way, and idempotent if retried.
 */
export async function upsertSeatingDecision(
  restaurantId: ID,
  decision: SeatingDecision,
): Promise<void> {
  const { error } = await supabase
    .from('seating_decisions')
    .upsert(seatingDecisionToRow(restaurantId, decision), { onConflict: 'id' })
  if (error) throw error
}

/**
 * Stamp the seating's start and clear times onto a reservation's accepted
 * decision. Targets the latest *accepted* decision (`chosen not null`) for the
 * reservation; a manual seat that never ran the engine has no such row and this
 * no-ops.
 *
 * Writes timestamps, never a duration: whether the gap between them is a real
 * seated duration is a judgement that belongs in `seating_decision_outcomes`,
 * where it can be revised without re-collecting the data.
 *
 * PostgREST can't order+limit an UPDATE inline, so we resolve the target id
 * first, then patch by id — two round-trips, fire-and-forget from the store.
 */
export async function recordDecisionOutcome(
  restaurantId: ID,
  reservationId: ID,
  seatedAt: string,
  clearedAt: string,
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
    .update({ seated_at: seatedAt, cleared_at: clearedAt })
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
