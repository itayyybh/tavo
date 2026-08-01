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
import type { ID, Reservation, Table } from '@/types'
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

  // Organize the largest tables first: seed merges from the biggest tables so a
  // party lands on prime capacity before smaller tables get chained.
  const capOf = (t: (typeof available)[number]) =>
    floor.tableTypes.find((ty) => ty.id === t.typeId)?.connectedCapacity ?? 0
  const seeds = [...available].sort((a, b) => capOf(b) - capOf(a))

  for (const seed of seeds) {
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

/** A restricted zone from an active large-party rule. */
interface ZoneRestriction {
  zoneId: ID
  /** comboKey of each allowed table-id set. */
  allowedKeys: Set<string>
  /** The allowed combos as ready candidates, so generation can't miss them. */
  injected: SeatCandidate[]
}

/**
 * Resolve the large-party rules that apply to this reservation into per-zone
 * restrictions. Rules are authored by zone name + table label; they resolve
 * against the current layout here. A zone with an active rule only permits its
 * listed combos; the same combos are injected (when all members are free) so a
 * mandated arrangement like 7+10+11+12 is always offered.
 */
function largePartyRestrictions(
  reservation: Reservation,
  floor: SeatingFloor,
): ZoneRestriction[] {
  const rules = floor.config.merge.largePartyRules ?? []
  const active = rules.filter((r) => reservation.partySize >= r.minPartySize)
  if (active.length === 0) return []

  const zoneByName = new Map(floor.zones.map((z) => [z.name, z]))
  const out: ZoneRestriction[] = []
  for (const rule of active) {
    const zone = zoneByName.get(rule.zoneName)
    if (!zone) continue
    const byLabel = new Map(
      floor.tables.filter((t) => t.zoneId === zone.id).map((t) => [t.label, t]),
    )
    const allowedKeys = new Set<string>()
    const injected: SeatCandidate[] = []
    for (const combo of rule.allowedCombos) {
      const tables = combo
        .map((label) => byLabel.get(label))
        .filter((t): t is Table => !!t)
      if (tables.length !== combo.length) continue // a label isn't in this zone
      allowedKeys.add(comboKey(tables.map((t) => t.id)))
      // Inject only when every member is free to seat right now.
      if (tables.every((t) => t.status === 'available')) {
        injected.push({
          kind: 'merge',
          tableIds: [...tables.map((t) => t.id)].sort(),
          tables,
          seats: hypotheticalMergeCapacity(tables, floor.tableTypes),
          zoneId: zone.id,
        })
      }
    }
    out.push({ zoneId: zone.id, allowedKeys, injected })
  }
  return out
}

/**
 * All seating options for a reservation: available singles + bounded merge
 * combinations that reach the party size and pass membership merge rules. Then
 * large-party rules restrict/inject combos for their zones.
 */
export function generateCandidates(
  reservation: Reservation,
  floor: SeatingFloor,
): SeatCandidate[] {
  const base = [...singleCandidates(floor), ...mergeCandidates(reservation, floor)]
  const restrictions = largePartyRestrictions(reservation, floor)
  if (restrictions.length === 0) return base

  const byZone = new Map(restrictions.map((r) => [r.zoneId, r]))
  // In a restricted zone, keep only exact allowed combos; other zones untouched.
  const result = base.filter((c) => {
    const r = byZone.get(c.zoneId)
    return !r || r.allowedKeys.has(comboKey(c.tableIds))
  })
  // Add mandated combos generation may have missed (dedup by id-set).
  const seen = new Set(result.map((c) => comboKey(c.tableIds)))
  for (const r of restrictions) {
    for (const cand of r.injected) {
      const key = comboKey(cand.tableIds)
      if (!seen.has(key)) {
        seen.add(key)
        result.push(cand)
      }
    }
  }
  return restrictToPreferredZone(reservation, withBringOptions(reservation, result))
}

/**
 * Hard zone rule: a guest is only ever seated in their preferred zone — or on a
 * table brought INTO it. Drops every other-zone option. No preferred zone (should
 * not happen — zone is required) leaves candidates untouched.
 */
function restrictToPreferredZone(
  reservation: Reservation,
  candidates: SeatCandidate[],
): SeatCandidate[] {
  const preferred = reservation.preferredZoneId
  if (!preferred) return candidates
  return candidates.filter(
    (c) => c.zoneId === preferred || c.relocateToZoneId === preferred,
  )
}

/**
 * When a reservation has a preferred zone, offer to BRING a free single table
 * from another zone into it — a second-choice above seating in a different zone
 * (the host keeps their preferred zone). Suggest-only: the physical move is
 * Phase 8. Only single tables are brought; a party needing a merge falls through
 * to the normal other-zone options.
 */
function withBringOptions(
  reservation: Reservation,
  candidates: SeatCandidate[],
): SeatCandidate[] {
  const preferred = reservation.preferredZoneId
  if (!preferred) return candidates
  const brings = candidates
    .filter((c) => c.kind === 'single' && c.zoneId !== preferred)
    .map<SeatCandidate>((c) => ({ ...c, relocateToZoneId: preferred }))
  return [...candidates, ...brings]
}
