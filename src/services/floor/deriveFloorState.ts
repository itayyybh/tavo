/**
 * Pure derivation of the effective Live Floor (Phase 8).
 *
 * `effectiveTable = baseTable + liveOverride`. Given the read-only base tables,
 * the reservations (for reserved-table awareness) and the runtime `FloorSnapshot`,
 * this computes what the host sees. Store-free and side-effect-free — mirrors the
 * Seating Engine's purity so it stays trivially testable. The Live Floor stores
 * only raw overrides; every "what does this table look like now" question is
 * answered here.
 */
import type { FloorSnapshot, FloorTableStatus, ID, Reservation, Table } from '@/types'
import { findAssignmentConflicts } from '@/utils'
import type { EffectiveFloor, EffectiveTable, FloorPreview, TableUrgency } from './types'

/** Reservation statuses that reserve (but haven't yet occupied) their tables. */
const RESERVING_STATUSES: Reservation['status'][] = ['confirmed', 'arrived']

/** Bucket minutes-until-arrival into a graded urgency (undefined = >30m away). */
export function urgencyOf(minutesUntil: number): TableUrgency | undefined {
  if (minutesUntil < 0) return 'overdue'
  if (minutesUntil <= 5) return 'imminent'
  if (minutesUntil <= 15) return 'due'
  if (minutesUntil <= 30) return 'soon'
  return undefined
}

export interface DeriveFloorInput {
  /** Base tables from the layout (read-only). */
  tables: Table[]
  /** All reservations — used to mark reserved (upcoming, assigned) tables. */
  reservations: Reservation[]
  /** The current shift's runtime override layer. */
  snapshot: FloorSnapshot
  /**
   * Minutes ahead of now a booking must be due before its table reads
   * `reserved` (an `arrived` booking always counts, regardless of `dateTime`).
   * A booking further out leaves the table `available` with `upcomingReservationId`
   * set instead, so the host can still walk-in seat it. From
   * `settingsStore.reservedLookaheadMin`.
   */
  reservedLookaheadMin: number
  /** Turnover buffer (minutes) — pads windows when detecting double-books. */
  turnoverBufferMin: number
  /**
   * Hypothetical seating options to overlay for preview (Phase 12) — tables the
   * host is comparing before committing. Marks the affected tables with a dashed
   * accent overlay; does NOT change their real status. Empty in normal operation.
   */
  previews?: FloorPreview[]
  /** Injectable for tests; defaults to the real clock. */
  now?: number
}

/**
 * Resolve the effective floor. Status precedence, highest wins:
 * `occupied` (in a seating) → `blocked` → `cleaning` (host overrides) →
 * `reserved` (booking due within the lookahead window) → `available`.
 */
export function deriveFloorState({
  tables,
  reservations,
  snapshot,
  reservedLookaheadMin,
  turnoverBufferMin,
  previews = [],
  now = Date.now(),
}: DeriveFloorInput): EffectiveFloor {
  const {
    seatings,
    runtimeMerges,
    statusOverrides,
    positionOverrides,
    rotationOverrides,
  } = snapshot

  // table id → its active seating (occupancy is derived, never stored as status).
  const seatingByTable = new Map<ID, { seatingId: ID; reservationId: ID }>()
  for (const s of seatings) {
    for (const tableId of s.tableIds) {
      seatingByTable.set(tableId, { seatingId: s.id, reservationId: s.reservationId })
    }
  }

  // table id → runtime merge it belongs to (overrides any base group).
  const runtimeMergeByTable = new Map<ID, ID>()
  for (const m of runtimeMerges) {
    for (const tableId of m.tableIds) runtimeMergeByTable.set(tableId, m.id)
  }

  // Tables double-booked across overlapping windows — flagged so the floor shows
  // the clash rather than silently hiding whichever booking loses the map race.
  const conflictTables = findAssignmentConflicts(reservations, turnoverBufferMin).tableIds

  // table id → the preview overlay it carries. First option to claim a table owns
  // its color; a second claimant marks it `contested` (only one could be seated).
  const previewByTable = new Map<ID, { color: string; contested: boolean }>()
  for (const p of previews) {
    for (const tableId of p.tableIds) {
      const existing = previewByTable.get(tableId)
      if (existing) existing.contested = true
      else previewByTable.set(tableId, { color: p.color, contested: false })
    }
  }

  // table id → the reservation holding it, split by how soon it's due.
  // `arrived` is always "due now" regardless of dateTime (the guest is here).
  // Bookings are processed soonest-first so a table's reserved/upcoming binding
  // is always the NEXT party to arrive, not whichever row came first in the array.
  const lookaheadMs = reservedLookaheadMin * 60_000
  const reservedByTable = new Map<ID, ID>()
  const upcomingByTable = new Map<ID, ID>()
  const resById = new Map<ID, Reservation>()
  const sorted = [...reservations].sort(
    (a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime),
  )
  for (const r of sorted) {
    resById.set(r.id, r)
    if (!RESERVING_STATUSES.includes(r.status)) continue
    const dueSoon = r.status === 'arrived' || Date.parse(r.dateTime) - now <= lookaheadMs
    const target = dueSoon ? reservedByTable : upcomingByTable
    for (const tableId of r.assignedTableIds ?? []) {
      if (!target.has(tableId)) target.set(tableId, r.id)
    }
  }

  // Minutes from now until a booking's arrival (negative once its time passes).
  const minutesUntilOf = (reservationId: ID | undefined): number | undefined => {
    const r = reservationId ? resById.get(reservationId) : undefined
    return r ? Math.round((Date.parse(r.dateTime) - now) / 60_000) : undefined
  }

  const effective = tables.map<EffectiveTable>((base) => {
    const seat = seatingByTable.get(base.id)
    const override = statusOverrides[base.id]
    const reservedBy = reservedByTable.get(base.id)

    let status: FloorTableStatus
    let seatingId: ID | undefined
    let reservationId: ID | undefined

    if (seat) {
      status = 'occupied'
      seatingId = seat.seatingId
      reservationId = seat.reservationId
    } else if (override) {
      status = override // 'blocked' | 'cleaning'
    } else if (reservedBy) {
      status = 'reserved'
      reservationId = reservedBy
    } else {
      status = 'available'
    }

    const runtimeMergeId = runtimeMergeByTable.get(base.id)

    // Only meaningful while available — a further-out booking still on the books,
    // so the host can seat a walk-in here without being blindsided.
    const upcomingReservationId =
      status === 'available' ? upcomingByTable.get(base.id) : undefined

    // The soonest future booking on an occupied table — the second seating.
    const nextReservationId =
      status === 'occupied'
        ? (reservedByTable.get(base.id) ?? upcomingByTable.get(base.id))
        : undefined

    // Arrival pressure of the table's most pressing pending party: the reserved
    // one, the upcoming one, or — for an occupied table — the next seating. Drives
    // the floor's reserved-visual ramp and the rail countdown.
    const pending = reservationId ?? upcomingReservationId ?? nextReservationId
    const minutesUntil =
      status === 'occupied' ? undefined : minutesUntilOf(pending)
    // An `arrived` party is physically present and waiting — maximally urgent
    // regardless of their booked time (they may have come early). Otherwise bucket
    // by minutes-until-arrival.
    const pendingArrived =
      !!pending && resById.get(pending)?.status === 'arrived'
    const urgency =
      status === 'occupied'
        ? undefined
        : pendingArrived
          ? 'overdue'
          : minutesUntil == null
            ? undefined
            : urgencyOf(minutesUntil)

    return {
      base,
      position: positionOverrides[base.id] ?? base.position,
      rotation: rotationOverrides[base.id] ?? base.rotation,
      status,
      seatingId,
      reservationId,
      upcomingReservationId,
      nextReservationId,
      minutesUntil,
      urgency,
      mergedGroupId: runtimeMergeId ?? base.mergedGroupId,
      isRuntimeMerge: runtimeMergeId != null,
      conflict: conflictTables.has(base.id) || undefined,
      preview: previewByTable.get(base.id),
    }
  })

  const byId: Record<ID, EffectiveTable> = {}
  for (const t of effective) byId[t.base.id] = t

  return { tables: effective, byId, seatings, runtimeMerges }
}
