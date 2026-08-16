import type { ID, Reservation } from '@/types'
import { supabase } from './client'
import { reservationFromRow, reservationToRow, type ReservationRow } from './mappers'

/**
 * Reservations repository (Phase 9) — the tenant-scoped replacement for
 * `reservationStorage` (localStorage). Every call passes `restaurantId`; RLS in
 * the database is the real guard, but scoping queries here keeps payloads small
 * and intent explicit.
 *
 * Row-level ops (not blob save) so Realtime and idempotent create work per row.
 */

/** All reservations for a restaurant, oldest first (stable order for the list). */
export async function listReservations(restaurantId: ID): Promise<Reservation[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as ReservationRow[]).map(reservationFromRow)
}

/**
 * Insert a reservation. The row carries the client-minted id, so a retried
 * submit collides on the primary key instead of creating a duplicate — the
 * idempotency guard the mobile flow needs on flaky networks.
 */
export async function insertReservation(
  restaurantId: ID,
  reservation: Reservation,
): Promise<Reservation> {
  const { data, error } = await supabase
    .from('reservations')
    .insert(reservationToRow(restaurantId, reservation))
    .select('*')
    .single()
  if (error) throw error
  return reservationFromRow(data as ReservationRow)
}

/** Patch mutable fields. Only the columns present in `patch` are written. */
export async function updateReservation(
  restaurantId: ID,
  reservation: Reservation,
): Promise<Reservation> {
  const { data, error } = await supabase
    .from('reservations')
    .update(reservationToRow(restaurantId, reservation))
    .eq('id', reservation.id)
    .eq('restaurant_id', restaurantId)
    .select('*')
    .single()
  if (error) throw error
  return reservationFromRow(data as ReservationRow)
}

export async function deleteReservation(restaurantId: ID, id: ID): Promise<void> {
  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
  if (error) throw error
}

/** Delete every reservation for a restaurant (Clear All). One round-trip. */
export async function deleteAllReservations(restaurantId: ID): Promise<void> {
  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('restaurant_id', restaurantId)
  if (error) throw error
}

/** Permanently delete every ARCHIVED reservation — empty History. One round-trip. */
export async function deleteArchivedReservations(restaurantId: ID): Promise<void> {
  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('restaurant_id', restaurantId)
    .eq('archived', true)
  if (error) throw error
}
