/**
 * Reservation Assignment Optimizer (Phase 12) — pure planner.
 *
 * Pre-arrival repack of the booking sheet: when a reservation can't be seated
 * because the tables that would fit are tentatively held by OTHER bookings, this
 * reshuffles those tentative holds so the floor packs tighter and the target
 * fits. Booking-sheet only — it returns a plan of `assignedTableIds` changes;
 * nothing physically moves and nothing is written here. The caller previews the
 * plan, the host confirms, and execution reuses the store's `assignTable`.
 *
 * Scope (deliberately bounded for Step 1):
 * - Only *tentative* reservations move — active and not yet `arrived`/`seated`.
 *   A party that has physically arrived is never reshuffled.
 * - Only reservations whose time window overlaps the target's (± turnover
 *   buffer) are considered — the ones actually in the way.
 * - Within that set, the search treats every reservation as mutually exclusive
 *   on tables (conservative): a produced plan is always valid, though a tighter
 *   packing that relies on two members not overlapping each other may be missed.
 *   That's a Step-1 simplification, not a correctness gap.
 *
 * Feasibility and rules are NOT re-implemented: candidate generation
 * (`generateCandidates`), hard constraints (`canSeat`), and time-window
 * conflicts against non-reshuffled bookings (`busyTableIds`) are all reused, so
 * every move in a plan obeys the same rules the live engine enforces.
 */
import type { ID, Reservation, ReservationStatus } from '@/types'
import { isActiveStatus } from '@/utils'
import { busyTableIds, canSeat } from './canSeat'
import { generateCandidates } from './candidates'
import type { SeatCandidate, SeatingFloor } from './types'

const MINUTE = 60_000

/** Statuses whose party is physically committed — never reshuffled. */
const COMMITTED_STATUSES: ReservationStatus[] = ['arrived', 'seated']

/** One reservation's assignment change in a repack plan. */
export interface AssignmentMove {
  reservationId: ID
  /** Tables the reservation held before (empty for the newly-seated target). */
  fromTableIds: ID[]
  /** Tables the reservation holds after the repack. */
  toTableIds: ID[]
}

/**
 * A reshuffle that makes room for `target`. `moves[0]` seats the target; the
 * rest relocate the tentative bookings that were in the way. Every move is a
 * real change (unchanged assignments are omitted).
 */
export interface RepackPlan {
  /** The reservation the repack seats. */
  target: ID
  moves: AssignmentMove[]
}

/** Tables a reservation currently holds. */
const held = (r: Reservation): ID[] => r.assignedTableIds ?? []

/** A tentative reservation may be reshuffled; a committed/terminal one may not. */
const isMovable = (r: Reservation): boolean =>
  isActiveStatus(r.status) && !COMMITTED_STATUSES.includes(r.status)

const windowOf = (r: Reservation): [number, number] => {
  const start = Date.parse(r.dateTime)
  return [start, start + r.estimatedDuration * MINUTE]
}

/** Do two reservations' windows overlap once padded by the turnover buffer? */
const windowsCollide = (a: Reservation, b: Reservation, buffer: number): boolean => {
  const [aStart, aEnd] = windowOf(a)
  const [bStart, bEnd] = windowOf(b)
  return aStart < bEnd + buffer && bStart < aEnd + buffer
}

/** Same table set regardless of order. */
const sameTables = (a: ID[], b: ID[]): boolean =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join()

/** Lexicographic compare of two equal-length numeric keys. */
const compareKey = (a: number[], b: number[]): number => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/**
 * Plan a repack that seats `target`, or `null` if no valid reshuffle of
 * tentative bookings makes it fit.
 *
 * @param target       the reservation that couldn't be seated
 * @param floor        read-only floor snapshot
 * @param reservations every reservation (the target may be included; it's handled by id)
 * @param branchCap    search-node ceiling; guarantees a bounded, sub-second run
 */
export function optimizeAssignments(
  target: Reservation,
  floor: SeatingFloor,
  reservations: Reservation[],
  branchCap = 20_000,
): RepackPlan | null {
  const buffer = floor.config.turnoverBufferMin * MINUTE
  const others = reservations.filter((r) => r.id !== target.id)

  // The tentative bookings in the target's way: overlapping in time, movable,
  // and actually holding tables (an unassigned one blocks nothing).
  const movable = others.filter(
    (r) => isMovable(r) && held(r).length > 0 && windowsCollide(target, r, buffer),
  )

  const toPlace = [target, ...movable]
  const placeIds = new Set(toPlace.map((r) => r.id))

  // Reservations we are NOT reshuffling — their held tables are fixed obstacles
  // for anyone whose window overlaps theirs (reused time logic via busyTableIds).
  const external = reservations.filter((r) => !placeIds.has(r.id))

  // Rules apply on an all-available floor so current occupancy doesn't gate
  // generation — disjointness + external conflicts are enforced below instead.
  const openFloor: SeatingFloor = {
    ...floor,
    tables: floor.tables.map((t) => ({ ...t, status: 'available' as const })),
  }

  // Tables currently held by a booking we might reshuffle — grabbing one forces
  // that booking to move too, so the search prefers free tables over these.
  const contested = new Set<ID>()
  for (const r of movable) for (const id of held(r)) contested.add(id)

  // Rank a reservation's candidate to bias the search toward few, tight moves:
  //  1. keep a movable booking on its current table when possible;
  //  2. avoid tables held by another reshuffled booking (chained moves);
  //  3. tightest fit, then fewest tables.
  const rank = (r: Reservation, c: SeatCandidate): number[] => {
    const current = held(r)
    const stays = r.id !== target.id && sameTables(c.tableIds, current) ? 0 : 1
    const grabs = c.tableIds.reduce(
      (n, id) => n + (contested.has(id) && !current.includes(id) ? 1 : 0),
      0,
    )
    return [stays, grabs, c.seats - r.partySize, c.tableIds.length]
  }

  // Per-reservation candidate pool: rule-feasible and clear of tables held by an
  // overlapping external booking (reused time logic via busyTableIds), ranked.
  const pool = new Map<ID, SeatCandidate[]>()
  for (const r of toPlace) {
    const busy = busyTableIds(r, floor, external)
    const feasible = generateCandidates(r, openFloor, [])
      .filter((c) => canSeat(r, c, openFloor, []).ok)
      .filter((c) => !c.tableIds.some((id) => busy.has(id)))
      .sort((a, b) => compareKey(rank(r, a), rank(r, b)))
    pool.set(r.id, feasible)
  }

  // Depth-first assignment: give every reservation a candidate whose tables are
  // disjoint from those already taken in this placement. First solution wins;
  // ordering above makes it a low-move one.
  const chosen = new Map<ID, ID[]>()
  const used = new Set<ID>()
  let branches = 0

  const search = (i: number): boolean => {
    if (i === toPlace.length) return true
    if (++branches > branchCap) return false
    const r = toPlace[i]
    for (const c of pool.get(r.id)!) {
      if (c.tableIds.some((id) => used.has(id))) continue
      for (const id of c.tableIds) used.add(id)
      chosen.set(r.id, c.tableIds)
      if (search(i + 1)) return true
      for (const id of c.tableIds) used.delete(id)
      chosen.delete(r.id)
    }
    return false
  }

  if (!search(0)) return null

  // A move for every reservation whose assignment actually changed.
  const moves: AssignmentMove[] = []
  for (const r of toPlace) {
    const to = chosen.get(r.id)!
    const from = held(r)
    if (!sameTables(from, to)) {
      moves.push({ reservationId: r.id, fromTableIds: from, toTableIds: to })
    }
  }

  // The target must actually get seated for this to be a repack.
  if (!moves.some((m) => m.reservationId === target.id)) return null

  // Target's placement leads.
  moves.sort((a, b) => (a.reservationId === target.id ? -1 : b.reservationId === target.id ? 1 : 0))

  return { target: target.id, moves }
}
