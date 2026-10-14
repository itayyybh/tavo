import { create } from 'zustand'
import type { ID, SeatingDecision } from '@/types'
import type { Suggestion } from '@/services/seating/types'
import { toDecisionEntries } from '@/services/seating/decisionLog'
import {
  insertSeatingDecision,
  upsertSeatingDecision,
  recordDecisionOutcome,
} from '@/services/supabase/seatingDecisionsRepo'
import { createId } from '@/utils'
import { useSessionStore } from './sessionStore'

/**
 * Decision Log Store — an append-only record of seating decisions (Phase 7;
 * DB-persisted in Phase 11). Kept separate from the reservation and layout
 * stores (see the `state-managment` skill). It is the AI hook: today it makes
 * seating auditable; persisted, it becomes durable decision history / training
 * data for a future model-based scorer.
 *
 * A decision is written to the database as soon as the engine produces it, in
 * `logSuggestion`, and updated in place if the host accepts one. Writing only on
 * acceptance left abandoned runs unrecorded — the very cases where the engine
 * offered nothing useful — so `chosen is null` now carries that meaning. Its
 * outcome is stamped later, on `recordOutcome`, when the party is cleared.
 */
interface DecisionLogState {
  /** Most recent first. */
  decisions: SeatingDecision[]
  /**
   * Record a suggestion run; returns the new decision's id. `predictedMinutes`
   * is the reservation's estimated duration, snapshotted here so the engine's
   * prediction is graded against the actual stay later.
   */
  logSuggestion: (
    reservationId: ID,
    partySize: number,
    predictedMinutes: number,
    suggestions: Suggestion[],
  ) => ID
  /** Attach the accepted table ids to a logged decision, then persist it. */
  recordAccept: (decisionId: ID, chosenIds: ID[]) => void
  /**
   * Record an applied repack (Phase 12): the host ran the assignment optimizer
   * to seat a party the engine could not place with its one-at-a-time search.
   * Logged as an override with an EMPTY ranked set — the engine offered nothing,
   * the reshuffle did — and persisted immediately, like `recordAccept`.
   * `chosenIds` are the tables the target ends up on; `predictedMinutes` is its
   * estimated duration, so the outcome is graded later like any other decision.
   */
  logRepack: (
    reservationId: ID,
    partySize: number,
    predictedMinutes: number,
    chosenIds: ID[],
  ) => void
  /**
   * Grade a completed seating: stamp when the party was seated and when its
   * tables were cleared onto the reservation's accepted decision. No-ops when
   * the seating never ran the engine.
   *
   * Takes timestamps rather than a duration deliberately — a clear often lands
   * long after the party left, and only the raw times let that be spotted
   * later. The usable duration is derived in `seating_decision_outcomes`.
   */
  recordOutcome: (reservationId: ID, seatedAt: string, clearedAt: string) => void
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
  logSuggestion: (reservationId, partySize, predictedMinutes, suggestions) => {
    const id = createId()
    const decision: SeatingDecision = {
      id,
      reservationId,
      ts: new Date().toISOString(),
      partySize,
      predictedMinutes,
      ranked: toDecisionEntries(suggestions),
    }
    set((s) => ({ decisions: [decision, ...s.decisions] }))
    const rid = activeRestaurant()
    if (rid) persist(insertSeatingDecision(rid, decision))
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
    if (rid) persist(upsertSeatingDecision(rid, accepted))
  },
  logRepack: (reservationId, partySize, predictedMinutes, chosenIds) => {
    const decision: SeatingDecision = {
      id: createId(),
      reservationId,
      ts: new Date().toISOString(),
      partySize,
      predictedMinutes,
      ranked: [],
      chosen: chosenIds,
      overridden: true,
    }
    set((s) => ({ decisions: [decision, ...s.decisions] }))
    const rid = activeRestaurant()
    if (rid) persist(insertSeatingDecision(rid, decision))
  },
  recordOutcome: (reservationId, seatedAt, clearedAt) => {
    set((s) => ({
      decisions: s.decisions.map((d) =>
        d.reservationId === reservationId && d.chosen && d.clearedAt === undefined
          ? { ...d, seatedAt, clearedAt }
          : d,
      ),
    }))
    const rid = activeRestaurant()
    if (rid) persist(recordDecisionOutcome(rid, reservationId, seatedAt, clearedAt))
  },
  clear: () => set({ decisions: [] }),
}))
