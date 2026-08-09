/**
 * Server-side reservation logic entry (Phase 12) — the bundle source for the
 * whatsapp-webhook Edge Function's `_reservation.mjs`.
 *
 * The WhatsApp channel must run the EXACT same field validation and duplicate
 * heuristic the manual host form runs, so a "WhatsApp booking" and a "manual
 * booking" can never quietly disagree on the rules. Rather than reimplement them
 * for Deno, this thin module re-exports the real, already-tested functions and
 * is bundled (esbuild) into the function folder — the same approach the
 * availability engine uses (`availabilityServer.ts` -> `_engine.mjs`).
 *
 * Everything re-exported here is pure (no store, no browser deps), so it bundles
 * cleanly for Deno and stays type-checked by the normal build.
 *
 * Build:  npm run build:edge:whatsapp
 */
export {
  validateReservation,
  isValidDraft,
  type ReservationDraft,
  type ReservationErrors,
  type ReservationErrorField,
} from '@/utils/reservationValidation'

export { findDuplicate } from '@/utils/reservations'
