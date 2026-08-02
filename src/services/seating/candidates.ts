/**
 * Candidate generation for the Seating Engine (Phase 7).
 *
 * Produces the raw set of seating options for a reservation: every available
 * single table, plus merge combinations that reach the party size and pass the
 * membership merge rules. Filtering by fit and scoring happen later (Step 4) —
 * this stage only enumerates what's structurally possible.
 *
 * Merge search is proximity-seeded and bounded so it never explodes on a large
 * floor: from each seed table we grow toward its nearest same-zone neighbours,
 * stopping at the smallest set that seats the party (or at `maxMergeSize`). This
 * favours physically close merges and yields at most ~tables × maxMergeSize
 * trials rather than every subset. Trade-off: it finds a good small merge per
 * seed, not every possible merge — acceptable, since a smaller fitting merge is
 * always preferable and the scorer ranks across all seeds' results.
 */
import type { Reservation } from '@/types'
import { hypotheticalMergeCapacity, seatsForTable } from '@/utils'
import { centerDistance } from './geometry'
import { evaluateMerge, type MergeRuleContext } from './mergeRules'
import type { SeatCandidate, SeatingFloor } from './types'

/** Build the ids-key used to de-duplicate merges found from different seeds. */
function comboKey(ids: string[]): string {
  return [...ids].sort().join('+')
}

/** Every available single table as a candidate. */
function singleCandidates(floor: SeatingFloor): SeatCandidate[] {
  return floor.tables
    .filter((t) => t.status === 'available')
    .map((t) => ({
      kind: 'single' as const,
      tableIds: [t.id],
      tables: [t],
      seats: seatsForTable(
        t,
        floor.tableTypes.find((ty) => ty.id === t.typeId),
      ),
      zoneId: t.zoneId,
    }))
}

/** Proximity-seeded, bounded merge candidates that reach the party size. */
function mergeCandidates(reservation: Reservation, floor: SeatingFloor): SeatCandidate[] {
  const available = floor.tables.filter((t) => t.status === 'available')
  const maxSize = floor.config.merge.maxMergeSize ?? Infinity
  const ctx: MergeRuleContext = {
    zones: floor.zones,
    obstacles: floor.obstacles,
    tableTypes: floor.tableTypes,
    allTables: floor.tables,
    config: floor.config.merge,
  }

  const seen = new Set<string>()
  const out: SeatCandidate[] = []

  for (const seed of available) {
    // Grow toward nearest neighbours; same zone unless cross-zone merging is on.
    const pool = available
      .filter((t) => t.id !== seed.id)
      .filter((t) => floor.config.merge.allowCrossZoneMerge || t.zoneId === seed.zoneId)
      .sort((a, b) => centerDistance(seed, a) - centerDistance(seed, b))

    let members = [seed]
    for (const cand of pool) {
      if (members.length >= maxSize) break
      const trial = [...members, cand]
      // Skip a neighbour that breaks the rules (e.g. a forbidden combo); keep
      // trying the next nearest so one bad table doesn't stop the chain.
      if (!evaluateMerge(trial, ctx).ok) continue
      members = trial
      const seats = hypotheticalMergeCapacity(members, floor.tableTypes)
      if (seats >= reservation.partySize) {
        const key = comboKey(members.map((t) => t.id))
        if (!seen.has(key)) {
          seen.add(key)
          out.push({
            kind: 'merge',
            tableIds: [...members.map((t) => t.id)].sort(),
            tables: members,
            seats,
            zoneId: seed.zoneId,
          })
        }
        break // smallest fitting merge from this seed
      }
    }
  }

  return out
}

/**
 * All seating options for a reservation: available singles + bounded merge
 * combinations that reach the party size and pass membership merge rules.
 */
export function generateCandidates(
  reservation: Reservation,
  floor: SeatingFloor,
): SeatCandidate[] {
  return [...singleCandidates(floor), ...mergeCandidates(reservation, floor)]
}
