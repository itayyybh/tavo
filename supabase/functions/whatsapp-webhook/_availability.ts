// Availability + duplicate data for the WhatsApp channel (Phase 12).
//
// Reuses the SAME seating engine the manual flow and check-availability use —
// bundled here as ./_engine.mjs (see build:edge:whatsapp) so the two channels
// can never disagree on whether a slot is bookable. The only difference from
// check-availability is the client: there's no caller session on an inbound
// webhook, so this reads with the service_role client passed in.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
// deno-lint-ignore no-explicit-any
import { evaluateAvailability } from './_engine.mjs'

/** The engine's input for a single-zone availability probe. */
export interface AvailabilityInput {
  partySize: number
  dateTime: string
  estimatedDuration: number
  zoneId: string
}

/** Locale-free reason descriptor ({ key, params }) the engine returns when unavailable. */
export interface AvailabilityReason {
  key: string
  params?: Record<string, string | number>
}

export interface AvailabilityResult {
  available: boolean
  reason?: AvailabilityReason
}

/**
 * Run the real availability engine for the requested zone. Fetches the same
 * snapshot check-availability does (layout + reservations + settings), all
 * scoped to the restaurant, then delegates to the bundled engine.
 */
export async function checkZoneAvailability(
  supabase: SupabaseClient,
  restaurantId: string,
  input: AvailabilityInput,
): Promise<AvailabilityResult> {
  const [tt, zn, tb, cn, ob, rv, st] = await Promise.all([
    supabase.from('table_types').select('*').eq('restaurant_id', restaurantId),
    supabase.from('zones').select('*').eq('restaurant_id', restaurantId),
    supabase.from('tables').select('*').eq('restaurant_id', restaurantId),
    supabase.from('table_connections').select('*').eq('restaurant_id', restaurantId),
    supabase.from('obstacles').select('*').eq('restaurant_id', restaurantId),
    supabase.from('reservations').select('*').eq('restaurant_id', restaurantId),
    supabase
      .from('restaurant_settings')
      .select('seating, opening_hours, reservation_rules, booking_restrictions')
      .eq('restaurant_id', restaurantId)
      .maybeSingle(),
  ])

  return await evaluateAvailability(input, {
    tableTypes: tt.data ?? [],
    zones: zn.data ?? [],
    tables: tb.data ?? [],
    connections: cn.data ?? [],
    obstacles: ob.data ?? [],
    reservations: rv.data ?? [],
    seating: st.data?.seating ?? null,
    openingHours: st.data?.opening_hours ?? null,
    reservationRules: st.data?.reservation_rules ?? null,
    bookingRestrictions: st.data?.booking_restrictions ?? null,
  })
}

/** Minimal reservation shape the duplicate heuristic needs. */
export interface DuplicateCandidate {
  id: string
  guestName: string
  partySize: number
  dateTime: string
}

/**
 * Load existing reservations reduced to the fields findDuplicate reads. Keeps the
 * duplicate check identical to the manual form without pulling the full mapper
 * into the edge bundle.
 */
export async function loadReservationsForDuplicate(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<DuplicateCandidate[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, guest_name, party_size, date_time')
    .eq('restaurant_id', restaurantId)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    guestName: r.guest_name as string,
    partySize: r.party_size as number,
    dateTime: r.date_time as string,
  }))
}
