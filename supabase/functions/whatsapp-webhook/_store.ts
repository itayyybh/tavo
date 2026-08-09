// Service-role data access for the WhatsApp channel (Phase 12).
//
// The webhook has no user session, so every read/write here uses a service_role
// client that BYPASSES RLS. That's exactly why the `whatsapp_channels` /
// `whatsapp_conversations` tables have RLS enabled with no policies (see
// migration 0017): no client can touch them, only this function can.
//
// Two responsibilities: resolve tenancy from the business number
// (`whatsapp_channels`), and hold per-guest booking state across the multi-turn
// flow (`whatsapp_conversations`). Nothing here reasons about bookings — that's
// the LLM/validation/availability steps that consume this state.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** One line of the running transcript, oldest first. */
export interface TranscriptEntry {
  role: 'guest' | 'bot'
  text: string
  /** ISO timestamp. */
  at: string
}

/**
 * The in-progress booking. Kept loose on purpose: the LLM extraction step fills
 * these fields incrementally, and only when they're all present + valid does the
 * assembled ReservationDraft get validated (`_reservation.mjs`) and inserted. A
 * partial draft is normal mid-conversation.
 */
export interface DraftFields {
  guestName?: string
  phone?: string
  partySize?: number
  /** Canonical ISO datetime once date + time are both known. */
  dateTime?: string
  estimatedDuration?: number
  preferredZoneId?: string
  notes?: string
}

/** Everything persisted in `whatsapp_conversations.state`. */
export interface ConversationState {
  draft: DraftFields
  transcript: TranscriptEntry[]
}

/** A loaded conversation row (only the fields the flow needs). */
export interface Conversation {
  id: string
  restaurantId: string
  guestPhone: string
  state: ConversationState
}

const EMPTY_STATE: ConversationState = { draft: {}, transcript: [] }

/**
 * Resolve which restaurant owns the business number a message arrived on. This
 * is the channel's trust anchor — tenancy comes from the number, never from
 * anything in the message body. Returns null for an unknown number (the message
 * is then ignored: we don't know who it's for).
 */
export async function resolveRestaurantId(
  supabase: SupabaseClient,
  phoneNumberId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('whatsapp_channels')
    .select('restaurant_id')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()
  if (error) throw error
  return data?.restaurant_id ?? null
}

/**
 * Load the live conversation for a guest, or create a fresh one. A `collecting`
 * conversation older than `timeoutMin` is marked `abandoned` first (the guest
 * went silent), so a new message always starts a clean booking rather than
 * resuming a stale one. Relies on the partial unique index for one live
 * conversation per (restaurant, guest).
 */
export async function loadOrCreateConversation(
  supabase: SupabaseClient,
  restaurantId: string,
  guestPhone: string,
  timeoutMin: number,
): Promise<Conversation> {
  const { data: existing, error } = await supabase
    .from('whatsapp_conversations')
    .select('id, state, last_message_at')
    .eq('restaurant_id', restaurantId)
    .eq('guest_phone', guestPhone)
    .eq('status', 'collecting')
    .maybeSingle()
  if (error) throw error

  if (existing) {
    const ageMs = Date.now() - new Date(existing.last_message_at).getTime()
    const stale = ageMs > timeoutMin * 60_000
    if (!stale) {
      return {
        id: existing.id,
        restaurantId,
        guestPhone,
        state: normalizeState(existing.state),
      }
    }
    // Timed out — retire it so a fresh booking can begin.
    await markStatus(supabase, existing.id, 'abandoned')
  }

  const { data: created, error: insErr } = await supabase
    .from('whatsapp_conversations')
    .insert({
      restaurant_id: restaurantId,
      guest_phone: guestPhone,
      state: EMPTY_STATE,
      status: 'collecting',
    })
    .select('id, state')
    .single()
  if (insErr) throw insErr
  return {
    id: created.id,
    restaurantId,
    guestPhone,
    state: normalizeState(created.state),
  }
}

/** Persist updated state and bump the activity clock (resets the timeout). */
export async function saveState(
  supabase: SupabaseClient,
  id: string,
  state: ConversationState,
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ state, last_message_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Move a conversation to a terminal state (`confirmed` on booking, `abandoned` on timeout). */
export async function markStatus(
  supabase: SupabaseClient,
  id: string,
  status: 'confirmed' | 'abandoned',
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ status })
    .eq('id', id)
  if (error) throw error
}

/** Guard against a malformed/legacy state blob. */
function normalizeState(raw: unknown): ConversationState {
  const s = (raw ?? {}) as Partial<ConversationState>
  return {
    draft: s.draft ?? {},
    transcript: Array.isArray(s.transcript) ? s.transcript : [],
  }
}
