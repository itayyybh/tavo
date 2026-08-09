// Booking decision flow for the WhatsApp channel (Phase 12).
//
// Given the current conversation state, decides the SINGLE next reply — using
// the same rules as the manual host form so the two channels never diverge:
//   - validateReservation() (bundled _reservation.mjs) for required-field checks
//   - the real seating engine (_engine.mjs) for the availability check
//   - findDuplicate() (bundled _reservation.mjs) for the soft duplicate warning
//
// It only DECIDES; it does not insert. Assembling the draft, choosing which
// reply to send, and setting the stage flags (dupAck, awaitingConfirm) live
// here; the actual insert on a confirmed booking is step 8 in index.ts, gated on
// `readyToBook` + an affirmative reply.

import { findDuplicate, validateReservation } from './_reservation.mjs'
import {
  checkZoneAvailability,
  loadReservationsForDuplicate,
} from './_availability.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ConversationState, RestaurantContext } from './_store.ts'
import { isAffirmative, reply, type Lang, type ReplyParams } from './_reply.ts'

/** Default booking length when the guest doesn't specify one (mirrors the form's mid default). */
const DEFAULT_DURATION_MIN = 90

export interface Decision {
  /** The reply text to send, already localized. */
  text: string
  /**
   * True when the draft is complete, the slot is available, and a confirmation
   * prompt has been shown — so an affirmative reply should finalize the booking
   * (step 8). The state is mutated in place (awaitingConfirm) alongside this.
   */
  readyToBook: boolean
}

/**
 * Decide the next reply. Mutates `state` (draft normalization, dupAck,
 * awaitingConfirm) so the caller persists a single coherent state.
 */
export async function decideReply(
  supabase: SupabaseClient,
  restaurantId: string,
  state: ConversationState,
  ctx: RestaurantContext,
  lang: Lang,
  guestText: string,
): Promise<Decision> {
  const d = state.draft
  const zoneName = ctx.zones.find((z) => z.id === d.preferredZoneId)?.name
  const when = d.dateTime ? formatWhen(d.dateTime, ctx.timezone, lang) : undefined
  const params: ReplyParams = {
    name: d.guestName,
    partySize: d.partySize,
    when,
    zone: zoneName,
  }

  // Assemble the full draft the shared validator expects. Phone is the WhatsApp
  // number; duration defaults; email is optional (blank passes).
  const errors = validateReservation({
    guestName: d.guestName ?? '',
    phone: d.phone ?? '',
    email: '',
    partySize: d.partySize ?? 0,
    dateTime: d.dateTime ?? '',
    estimatedDuration: d.estimatedDuration ?? DEFAULT_DURATION_MIN,
    preferredZoneId: d.preferredZoneId,
    source: 'whatsapp',
    notes: d.notes ?? '',
  })

  // Ask for the next missing required field, in a natural order.
  if (errors.guestName) return notReady(state, reply(lang, 'askName', params))
  if (errors.partySize) return notReady(state, reply(lang, 'askParty', params))
  if (errors.dateTime) return notReady(state, reply(lang, 'askDateTime', params))
  if (errors.preferredZoneId) return notReady(state, reply(lang, 'askZone', params))

  // Draft is complete. Soft duplicate warning — surfaced once; the guest can
  // confirm it's a separate booking with an affirmative reply.
  if (!state.dupAck) {
    const existing = await loadReservationsForDuplicate(supabase, restaurantId)
    const dup = findDuplicate(existing, {
      guestName: d.guestName!,
      partySize: d.partySize!,
      dateTime: d.dateTime!,
    })
    if (dup) {
      if (isAffirmative(guestText)) {
        state.dupAck = true // proceed past the warning
      } else {
        return notReady(state, reply(lang, 'duplicate', params))
      }
    }
  }

  // Real availability check — same engine as the manual flow.
  const availability = await checkZoneAvailability(supabase, restaurantId, {
    partySize: d.partySize!,
    dateTime: d.dateTime!,
    estimatedDuration: d.estimatedDuration ?? DEFAULT_DURATION_MIN,
    zoneId: d.preferredZoneId!,
  })
  if (!availability.available) {
    return notReady(state, reply(lang, 'unavailable', params))
  }

  // Everything checks out — ask the guest to confirm. An affirmative reply now
  // finalizes the booking (step 8).
  state.awaitingConfirm = true
  return { text: reply(lang, 'confirmPrompt', params), readyToBook: true }
}

/** A reply that does not advance to booking; clears the confirm stage. */
function notReady(state: ConversationState, text: string): Decision {
  state.awaitingConfirm = false
  return { text, readyToBook: false }
}

/** Format an ISO datetime for the guest in their language + the restaurant tz. */
function formatWhen(iso: string, timezone: string | null, lang: Lang): string {
  try {
    // When no restaurant timezone is configured, format in the runtime's local
    // zone (the restaurant's zone by the app's implicit-local-time convention) —
    // NOT UTC — so the displayed hour matches what the guest asked for.
    return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
