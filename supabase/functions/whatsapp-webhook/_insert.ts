// Reservation insert for the WhatsApp channel (Phase 12).
//
// A confirmed WhatsApp conversation terminates as a normal `reservations` row —
// the same endpoint a manual host entry reaches — with two deliberate choices:
//
//   status = 'pending'      A WhatsApp booking is a REQUEST, not a guaranteed
//                           reservation. The host accepts it on the Floor /
//                           Reservations view (pending -> confirmed); it is
//                           never auto-reserved.
//   assignedTableIds unset  Table assignment is the host's job on the Floor, the
//                           same as any other booking — the bot never seats.
//
// Uses the service_role client (no caller session on a webhook). The row is
// built to match reservationToRow() so a WhatsApp row is indistinguishable from
// a manual one downstream apart from `source`.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { DraftFields } from './_store.ts'

const DEFAULT_DURATION_MIN = 90

/**
 * Insert a pending WhatsApp reservation and return its id. The draft is assumed
 * validated + available by the caller (see decideReply / confirmBooking).
 */
export async function insertPendingReservation(
  supabase: SupabaseClient,
  restaurantId: string,
  draft: DraftFields,
): Promise<string> {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const { error } = await supabase.from('reservations').insert({
    id,
    restaurant_id: restaurantId,
    guest_name: draft.guestName,
    phone: draft.phone ?? null,
    email: null,
    party_size: draft.partySize,
    date_time: draft.dateTime,
    estimated_duration: draft.estimatedDuration ?? DEFAULT_DURATION_MIN,
    preferred_zone_id: draft.preferredZoneId ?? null,
    preferred_table_id: null,
    assigned_table_ids: null,
    assignment_source: null,
    occasion: null,
    status: 'pending',
    source: 'whatsapp',
    preferences: null,
    notes: draft.notes ?? null,
    parsed_request: null,
    created_at: now,
    updated_at: now,
  })
  if (error) throw error
  return id
}
