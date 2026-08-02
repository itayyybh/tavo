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
import type {
  FloorSnapshot,
  FloorTableStatus,
  ID,
  Reservation,
  Table,
} from '@/types'
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
}

/**
 * Resolve the effective floor. Status precedence, highest wins:
 * `occupied` (in a seating) → `blocked` → `cleaning` (host overrides) →
 * `reserved` (assigned by an upcoming booking) → `available`.
 */
export function deriveFloorState({
  tables,
  reservations,
  snapshot,
}: DeriveFloorInput): EffectiveFloor {
  const { seatings, runtimeMerges, statusOverrides, positionOverrides, rotationOverrides } =
    snapshot

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

  // table id → an upcoming reservation that has reserved it.
  const reservedByTable = new Map<ID, ID>()
  for (const r of reservations) {
    if (!RESERVING_STATUSES.includes(r.status)) continue
    for (const tableId of r.assignedTableIds ?? []) {
      if (!reservedByTable.has(tableId)) reservedByTable.set(tableId, r.id)
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
      mergedGroupId: runtimeMergeId ?? base.mergedGroupId,
      isRuntimeMerge: runtimeMergeId != null,
    }
  })

  const byId: Record<ID, EffectiveTable> = {}
  for (const t of effective) byId[t.base.id] = t

  return { tables: effective, byId, seatings, runtimeMerges }
}
