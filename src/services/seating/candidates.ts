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
import {
  hypotheticalMergeCapacity,
  isActiveStatus,
  seatsForTable,
  zoneAllowsRelocation,
} from '@/utils'
import { busyTableIds } from './canSeat'
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

  // Last resort: the proximity-seeded search above tries one nearest-neighbour
  // chain per seed and stops at its first fit, so it can miss a valid combo
  // whose members aren't mutually nearest (e.g. four tables scattered around a
  // zone that together fit the party). Only kicks in PER ZONE where nothing
  // above already reaches the party size in THAT zone — checking globally was a
  // bug: a big-enough candidate in some OTHER zone (destined to be dropped by
  // the hard zone rule downstream, `restrictToPreferredZone`) would suppress
  // gather in the reservation's actual preferred zone, where it was needed.
  if (floor.config.merge.lastResortGatherZone !== false) {
    const satisfiedZones = new Set(
      out.filter((c) => c.seats >= reservation.partySize).map((c) => c.zoneId),
    )
    out.push(...gatherFromZone(reservation, floor, ctx, available, seen, satisfiedZones))
  }

  return out
}

/**
 * Last-resort merge: for each zone (except one that already has a big-enough
 * candidate — `skipZones`), gather its free tables (largest first, ignoring
 * physical proximity) and keep adding until the party fits or `maxMergeSize`
 * is hit. One attempt per zone — a broader net than the per-seed
 * nearest-neighbour search above, tried only once that's failed.
 */
function gatherFromZone(
  reservation: Reservation,
  floor: SeatingFloor,
  ctx: MergeRuleContext,
  available: Table[],
  seen: Set<string>,
  skipZones: Set<ID>,
): SeatCandidate[] {
  const maxSize = floor.config.merge.maxMergeSize ?? Infinity
  const capOf = (t: Table) =>
    floor.tableTypes.find((ty) => ty.id === t.typeId)?.connectedCapacity ?? 0
  const zoneIds = new Set(available.map((t) => t.zoneId))
  const out: SeatCandidate[] = []

  for (const zoneId of zoneIds) {
    if (skipZones.has(zoneId)) continue
    const pool = available
      .filter((t) => t.zoneId === zoneId)
      .sort((a, b) => capOf(b) - capOf(a))

    let members: Table[] = []
    for (const cand of pool) {
      if (members.length >= maxSize) break
      const trial = [...members, cand]
      if (trial.length >= 2 && !evaluateMerge(trial, ctx).ok) continue
      members = trial
      if (members.length < 2) continue
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
            zoneId,
          })
        }
        break
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
  others: Reservation[] = [],
): SeatCandidate[] {
  let result: SeatCandidate[] = [
    ...singleCandidates(floor),
    ...mergeCandidates(reservation, floor),
  ]

  // Large-party zone restrictions (when any apply): keep only allowed combos in a
  // restricted zone and inject the mandated ones.
  const restrictions = largePartyRestrictions(reservation, floor)
  if (restrictions.length > 0) {
    const byZone = new Map(restrictions.map((r) => [r.zoneId, r]))
    result = result.filter((c) => {
      const r = byZone.get(c.zoneId)
      return !r || r.allowedKeys.has(comboKey(c.tableIds))
    })
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
  }

  // Bring options: a free single table from another zone, and cross-zone merges
  // that complete an in-zone table with a brought one. Only when the preferred
  // zone permits relocation, and only from donor zones that also permit it — so a
  // tight indoor zone (Inside) never borrows or lends furniture; the outdoor
  // smoking/non-smoking areas may swap. Then the HARD zone rule (always applied)
  // drops anything not in / brought into the preferred zone.
  const zoneById = new Map(floor.zones.map((z) => [z.id, z]))
  const donorOk = (zoneId: ID) => zoneAllowsRelocation(zoneById.get(zoneId))
  const preferredId = reservation.preferredZoneId
  const bringAllowed = !!preferredId && donorOk(preferredId)
  const withBrings = bringAllowed
    ? [
        ...withBringOptions(reservation, result, donorOk),
        ...bringToMergeCandidates(reservation, floor, others, donorOk),
      ]
    : result
  return dedupeCandidates(restrictToPreferredZone(reservation, withBrings))
}

/** Drop duplicate options (same table set + same relocation intent). */
function dedupeCandidates(candidates: SeatCandidate[]): SeatCandidate[] {
  const seen = new Set<string>()
  const out: SeatCandidate[] = []
  for (const c of candidates) {
    const key = `${comboKey(c.tableIds)}|${c.relocateToZoneId ?? ''}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(c)
    }
  }
  return out
}

/**
 * Cross-zone bring-to-merge: when the preferred zone has a free table that's too
 * small alone, complete the merge by BRINGING free tables from other zones —
 * least-used first, then smallest that reaches the party size. The whole group
 * lives in the preferred zone (`relocateToZoneId`), so it survives the hard zone
 * rule. Only free (available + not time-conflicting) tables are used.
 */
function bringToMergeCandidates(
  reservation: Reservation,
  floor: SeatingFloor,
  others: Reservation[],
  donorOk: (zoneId: ID) => boolean,
): SeatCandidate[] {
  const preferred = reservation.preferredZoneId
  if (!preferred) return []
  const busy = busyTableIds(reservation, floor, others)
  const free = floor.tables.filter((t) => t.status === 'available' && !busy.has(t.id))
  const inZone = free.filter((t) => t.zoneId === preferred)
  // Donors: free tables in OTHER zones that themselves permit relocation.
  const otherZone = free.filter((t) => t.zoneId !== preferred && donorOk(t.zoneId))
  if (inZone.length === 0 || otherZone.length === 0) return []

  const typeOf = (t: Table) => floor.tableTypes.find((ty) => ty.id === t.typeId)
  const connectedOf = (t: Table) => typeOf(t)?.connectedCapacity ?? 0
  const soloOf = (t: Table) => typeOf(t)?.soloCapacity ?? 0
  const usageOf = (id: ID) =>
    others.filter((o) => isActiveStatus(o.status) && o.assignedTableIds?.includes(id))
      .length

  // Least-used first, then smallest that completes the fit.
  const donors = [...otherZone].sort(
    (a, b) => usageOf(a.id) - usageOf(b.id) || connectedOf(a) - connectedOf(b),
  )
  // Cross-zone is the whole point here, so relax the same-zone membership rule.
  const ctx: MergeRuleContext = {
    zones: floor.zones,
    obstacles: floor.obstacles,
    tableTypes: floor.tableTypes,
    allTables: floor.tables,
    config: { ...floor.config.merge, allowCrossZoneMerge: true },
  }
  const maxSize = floor.config.merge.maxMergeSize ?? Infinity
  const seen = new Set<string>()
  const out: SeatCandidate[] = []

  for (const anchor of inZone) {
    if (soloOf(anchor) >= reservation.partySize) continue // fits alone → a single covers it
    let members = [anchor]
    for (const donor of donors) {
      if (members.length >= maxSize) break
      const trial = [...members, donor]
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
            zoneId: preferred,
            relocateToZoneId: preferred,
          })
        }
        break
      }
    }
  }
  return out
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
  donorOk: (zoneId: ID) => boolean,
): SeatCandidate[] {
  const preferred = reservation.preferredZoneId
  if (!preferred) return candidates
  const brings = candidates
    .filter((c) => c.kind === 'single' && c.zoneId !== preferred && donorOk(c.zoneId))
    .map<SeatCandidate>((c) => ({ ...c, relocateToZoneId: preferred }))
  return [...candidates, ...brings]
}
