import { create } from 'zustand'
import type { ID, SeatingDecision } from '@/types'
import type { Suggestion } from '@/services/seating/types'
import { toDecisionEntries } from '@/services/seating/decisionLog'
import { insertSeatingDecision } from '@/services/supabase/seatingDecisionsRepo'
import { createId } from '@/utils'
import { useSessionStore } from './sessionStore'

/**
 * Decision Log Store — an append-only record of seating decisions (Phase 7;
 * DB-persisted in Phase 11). Kept separate from the reservation and layout
 * stores (see the `state-managment` skill). It is the AI hook: today it makes
 * seating auditable; persisted, it becomes durable decision history / training
 * data for a future model-based scorer.
 *
 * A decision is written to the database once, on `recordAccept` — the moment the
 * host commits to a table and `chosen` + the override signal are both known.
 */
interface DecisionLogState {
  /** Most recent first. */
  decisions: SeatingDecision[]
  /** Record a suggestion run; returns the new decision's id. */
  logSuggestion: (reservationId: ID, partySize: number, suggestions: Suggestion[]) => ID
  /** Attach the accepted table ids to a logged decision, then persist it. */
  recordAccept: (decisionId: ID, chosenIds: ID[]) => void
  clear: () => void
}

const activeRestaurant = () => useSessionStore.getState().restaurantId

/** Fire-and-forget a background write; surface failures without blocking the UI. */
const persist = (op: Promise<unknown>) => {
  op.catch((err) => console.error('Seating decision sync failed', err))
}

/** The host overrode the engine when the accepted set isn't the top-ranked option. */
const isOverride = (decision: SeatingDecision, chosenIds: ID[]): boolean => {
  const top = decision.ranked[0]?.tableIds
  if (!top) return false
  return top.length !== chosenIds.length || top.some((id, i) => id !== chosenIds[i])
}

export const useDecisionLogStore = create<DecisionLogState>((set, get) => ({
  decisions: [],
  logSuggestion: (reservationId, partySize, suggestions) => {
    const id = createId()
    const decision: SeatingDecision = {
      id,
      reservationId,
      ts: new Date().toISOString(),
      partySize,
      ranked: toDecisionEntries(suggestions),
    }
    set((s) => ({ decisions: [decision, ...s.decisions] }))
    return id
  },
  recordAccept: (decisionId, chosenIds) => {
    const existing = get().decisions.find((d) => d.id === decisionId)
    if (!existing) return
    const accepted: SeatingDecision = {
      ...existing,
      chosen: chosenIds,
      overridden: isOverride(existing, chosenIds),
    }
    set((s) => ({
      decisions: s.decisions.map((d) => (d.id === decisionId ? accepted : d)),
    }))
    const rid = activeRestaurant()
    if (rid) persist(insertSeatingDecision(rid, accepted))
  },
  clear: () => set({ decisions: [] }),
}))
