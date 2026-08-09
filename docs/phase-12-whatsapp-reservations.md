# Phase 12 — WhatsApp Reservation Agent

Scope note: this covers the WhatsApp booking channel only. The "AI listens to phone
calls" idea is deliberately out of scope for now — the iPhone the restaurant uses
has no third-party-accessible call audio (iOS platform limit), so it needs its own
plan later (VoIP migration or post-call transcript processing). Everything below
stands on its own.

## 1. Architecture

**Channel, not a new engine.** WhatsApp is a new *reservation source*, not a new
reservation system. It should terminate at the exact same place a manual host
entry does — a row in `reservations` with `source: 'whatsapp'` — and from that
point on it's invisible to the rest of the app: Realtime already pushes it to the
Floor and Reservations pages, the Seating Engine already reasons over it, nothing
downstream needs to know where it came from.

**New pieces required:**

1. `whatsapp` added to `RESERVATION_SOURCES` (`src/types/index.ts`).
2. A `whatsapp_channels` table: maps a Meta WhatsApp Business `phone_number_id` →
   `restaurant_id`. This is the piece the app doesn't have yet and needs: every
   existing server function (`check-availability`) derives tenancy from a logged-in
   staff member's session via `memberships`. A WhatsApp webhook has no user
   session — Meta just POSTs a message. Tenancy has to be resolved from *which
   business number the message arrived on*, so this mapping table is the new
   trust anchor.
3. A `whatsapp_conversations` table: `id, restaurant_id, guest_phone, state
   (jsonb draft + transcript), status ('collecting' | 'confirmed' | 'abandoned'),
   last_message_at`. Booking is multi-turn (party size → date → time → confirm),
   and each inbound message is a separate, stateless webhook call — there's no
   in-memory place to hold "what we know so far" between messages, so it has to
   be persisted.
4. A new Edge Function, `whatsapp-webhook`:
   - Verifies Meta's webhook signature.
   - Looks up `restaurant_id` from `whatsapp_channels` by `phone_number_id`.
   - Loads or creates the `whatsapp_conversations` row for that guest phone.
   - Sends the transcript + current draft to an LLM (structured extraction into
     the *existing* `ReservationDraft` shape from `reservationValidation.ts` —
     no new draft schema).
   - Runs the same rules that already exist:
     - `reservationValidation.ts` → `validateReservation()` for field-level checks.
     - The bundled `_engine.mjs` (already built for `check-availability`) for the
       real availability check — reused directly, not reimplemented, using a
       `service_role` Supabase client instead of the caller-scoped one, since
       there's no staff Authorization header to forward.
     - `findDuplicate()` from `utils/reservations.ts` for the same
       same-guest/same-window soft-duplicate warning the manual form gets.
   - On confirm: `insertReservation()` with `source: 'whatsapp'`, `status:
     'pending'` — table assignment is deliberately left unset, same as any other
     reservation; that's the host's job on the Floor view, not the bot's.
   - Sends the confirmation back via Meta's Graph API directly.

**No BSP needed.** Twilio/360dialog/WATI exist mainly to give *humans* an inbox UI
for managing conversations. This bot has no human inbox — it's fully automated —
so calling Meta's Cloud API directly is both simpler and avoids the per-message
markup a BSP adds. Simplifies the earlier WhatsApp cost discussion considerably.

## 2. Why this shape

- Reuses four pieces of existing, already-correct logic (validation, duplicate
  check, availability engine, insert path) instead of re-deriving booking rules
  for a second channel — the exact failure mode that causes a "website booking"
  and a "phone booking" to quietly disagree with each other over time.
- Keeps the trust boundary explicit: RLS protects every *user*-driven query in
  this app, but the webhook has no user, so `service_role` + the
  `whatsapp_channels` lookup becomes the boundary instead. Worth stating plainly
  rather than discovering it mid-implementation.
- Matches the "AI Preparation" work already in the codebase (`seatingDecisionsRepo`,
  `decisionLogStore`) — a WhatsApp-created reservation is exactly the kind of AI
  decision that repo pattern was built to log, so extending it (rather than
  starting a separate log) keeps Phase 11 and Phase 12 consistent.

## 3. Edge cases to design for

- **Guest goes silent mid-conversation.** Conversation times out (e.g. 30–60 min
  of inactivity) → status `abandoned`, no reservation created, no dangling
  `pending` row.
- **Requested slot unavailable.** MVP: tell the guest and ask for another time.
  Stretch: probe a few nearby times automatically and offer alternatives.
- **Guest wants to cancel/change an existing WhatsApp booking.** Needs a lookup
  by `guest_phone` + `restaurant_id` scoped to that WhatsApp channel — not built
  by default, has to be an explicit conversation branch.
- **Same guest messages twice** (different day, same request). `findDuplicate()`
  already handles same-name/same-party-size/±90min — surface it as a soft
  confirmation ("you already have a booking for 4 at 8pm — is this a different
  one?") rather than silently creating two.
- **Restaurant closed / outside booking rules.** Already enforced by the reused
  availability engine (`openingHours`, `reservationRules`, `bookingRestrictions`)
  — nothing new to build, just don't bypass it.
- **Multi-tenant safety.** Two restaurants could plausibly want the same guest
  phone number to look up two separate conversations — this is naturally handled
  since the channel (not the guest number) determines `restaurant_id`.
- **Language.** The app already has i18next; the bot's replies should read the
  restaurant's configured language rather than defaulting to English.
- **Message window rules.** Meta requires pre-approved templates for anything
  sent outside a 24h customer-initiated window — reminders sent well after a
  booking confirmation will need a template, not a free-form message.

## 4. Suggested improvements / stretch (not MVP)

- Log every WhatsApp-created reservation's extraction + availability check the
  same way `seating_decisions` logs seating choices — gives you an audit trail
  and, later, a way to measure the bot's accuracy against what a host would have
  done.
- Show `source: whatsapp` as a visible badge on the Reservations/Floor UI —
  `useReservationLabels.ts` already has a `sourceOptions` map driven by
  `RESERVATION_SOURCES`, so this is a small addition once `whatsapp` exists.

## 5. Build order (once this plan is approved)

1. Migration: add `whatsapp` to `RESERVATION_SOURCES`; create `whatsapp_channels`
   and `whatsapp_conversations` tables (service-role-only RLS — no client access).
2. Meta WhatsApp Business app + Cloud API number + webhook verify token.
3. `whatsapp-webhook` Edge Function: signature verification, channel → restaurant
   resolution, conversation load/create.
4. LLM extraction step into `ReservationDraft`, using the restaurant's zone names
   and rules (from `zones` + `restaurant_settings`) as conversation context.
5. Wire in the reused availability engine (`service_role` variant) + validation +
   duplicate check.
6. Insert on confirm, send Meta confirmation message.
7. UI: source badge/label for `whatsapp`.
8. End-to-end test against a real WhatsApp test number.
