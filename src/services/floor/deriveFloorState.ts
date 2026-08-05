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
import type { EffectiveFloor, EffectiveTable } from './types'

/** Reservation statuses that reserve (but haven't yet occupied) their tables. */
const RESERVING_STATUSES: Reservation['status'][] = ['confirmed', 'arrived']

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

  // table id → the reservation holding it, split by how soon it's due.
  // `arrived` is always "due now" regardless of dateTime (the guest is here).
  const lookaheadMs = reservedLookaheadMin * 60_000
  const reservedByTable = new Map<ID, ID>()
  const upcomingByTable = new Map<ID, ID>()
  for (const r of reservations) {
    if (!RESERVING_STATUSES.includes(r.status)) continue
    const dueSoon = r.status === 'arrived' || Date.parse(r.dateTime) - now <= lookaheadMs
    const target = dueSoon ? reservedByTable : upcomingByTable
    for (const tableId of r.assignedTableIds ?? []) {
      if (!target.has(tableId)) target.set(tableId, r.id)
    }
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

    return {
      base,
      position: positionOverrides[base.id] ?? base.position,
      rotation: rotationOverrides[base.id] ?? base.rotation,
      status,
      seatingId,
      reservationId,
      // Only meaningful while available — a further-out booking still on the
      // books, so the host can seat a walk-in here without being blindsided.
      upcomingReservationId:
        status === 'available' ? upcomingByTable.get(base.id) : undefined,
      mergedGroupId: runtimeMergeId ?? base.mergedGroupId,
      isRuntimeMerge: runtimeMergeId != null,
    }
  })

  const byId: Record<ID, EffectiveTable> = {}
  for (const t of effective) byId[t.base.id] = t

  return { tables: effective, byId, seatings, runtimeMerges }
}
