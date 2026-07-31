import { create } from 'zustand'
import type { ID, SeatingDecision } from '@/types'
import type { Suggestion } from '@/services/seating/types'
import { toDecisionEntries } from '@/services/seating/decisionLog'
import { createId } from '@/utils'

/**
 * Decision Log Store — an append-only record of seating decisions (Phase 7).
 * Kept separate from the reservation and layout stores (see the
 * `state-managment` skill). It is the Phase 11 AI hook: today it makes seating
 * auditable; later it becomes decision history / training data.
 */
interface DecisionLogState {
  /** Most recent first. */
  decisions: SeatingDecision[]
  /** Record a suggestion run; returns the new decision's id. */
  logSuggestion: (reservationId: ID, partySize: number, suggestions: Suggestion[]) => ID
  /** Attach the accepted table ids to a logged decision. */
  recordAccept: (decisionId: ID, chosenIds: ID[]) => void
  clear: () => void
}

export const useDecisionLogStore = create<DecisionLogState>((set) => ({
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
  recordAccept: (decisionId, chosenIds) =>
    set((s) => ({
      decisions: s.decisions.map((d) =>
        d.id === decisionId ? { ...d, chosen: chosenIds } : d,
      ),
    })),
  clear: () => set({ decisions: [] }),
}))
