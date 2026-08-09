// Supabase Edge Function (Phase 12) — WhatsApp reservation webhook.
//
// WhatsApp is a new reservation SOURCE, not a new engine: an inbound message is
// turned into a normal `reservations` row (source 'whatsapp') and from there is
// invisible to the rest of the app. This function is the channel's front door.
//
// Unlike check-availability, there is NO caller session — Meta (or, in dev, the
// mock provider) just POSTs a message. So:
//   - Tenancy is resolved from WHICH business number the message arrived on
//     (whatsapp_channels), never from a membership.
//   - The Supabase client uses the SERVICE_ROLE key and bypasses RLS; the
//     whatsapp_* tables have RLS on with no policies, so only this function can
//     read/write them.
//   - The transport (verify handshake, signature, parse, send) is behind the
//     WhatsAppProvider seam, so the mock (dev/tests) and Meta Cloud API
//     (production) are interchangeable without touching the logic below.
//
// This step is the plumbing: verify -> resolve tenant -> load/create the
// conversation -> record the message -> reply. The LLM extraction (step 6) and
// availability/validation/insert (steps 7-8) replace the placeholder reply.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — service-role data access
//   WHATSAPP_PROVIDER                        — 'mock' (default) | 'meta'
//   WHATSAPP_VERIFY_TOKEN                    — GET handshake token
//   WHATSAPP_CONVO_TIMEOUT_MIN               — inactivity timeout (default 45)
// Deploy:  supabase functions deploy whatsapp-webhook --project-ref <ref>
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getProvider } from './_provider.ts'
import type { InboundMessage } from './_provider.ts'
import { extractDraft } from './_extract.ts'
import {
  loadOrCreateConversation,
  loadRestaurantContext,
  resolveRestaurantId,
  saveState,
  type DraftFields,
} from './_store.ts'

const DEFAULT_TIMEOUT_MIN = 45

Deno.serve(async (req) => {
  const provider = await getProvider()

  // GET — provider webhook verification handshake (Meta's hub.challenge).
  if (req.method === 'GET') {
    return provider.verifyWebhook(req) ?? new Response('Not found', { status: 404 })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Read the raw body ONCE — the signature is computed over these exact bytes,
  // so it must be verified before the body is parsed as JSON.
  const rawBody = await req.text()
  if (!(await provider.verifySignature(req, rawBody))) {
    return new Response('Invalid signature', { status: 401 })
  }

  const messages = provider.parseInbound(rawBody)
  // Non-message callbacks (delivery/status) parse to []. Ack fast either way so
  // the provider doesn't retry.
  if (messages.length === 0) return new Response('ok', { status: 200 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const timeoutMin = Number(Deno.env.get('WHATSAPP_CONVO_TIMEOUT_MIN')) || DEFAULT_TIMEOUT_MIN

  // Process each message independently; one failing message must not drop the
  // rest, and we still ack the batch so the provider stops retrying.
  for (const msg of messages) {
    try {
      await handleMessage(supabase, provider, msg, timeoutMin)
    } catch (err) {
      console.error('[whatsapp] handle failed', err)
    }
  }
  return new Response('ok', { status: 200 })
})

/** Resolve tenant, load/advance the conversation, and reply. */
async function handleMessage(
  supabase: ReturnType<typeof createClient>,
  provider: Awaited<ReturnType<typeof getProvider>>,
  msg: InboundMessage,
  timeoutMin: number,
): Promise<void> {
  const restaurantId = await resolveRestaurantId(supabase, msg.phoneNumberId)
  if (!restaurantId) {
    // Unknown business number — we don't know who this is for. Ignore silently
    // rather than risk replying on behalf of a restaurant we can't identify.
    console.warn(`[whatsapp] no channel for phone_number_id=${msg.phoneNumberId}`)
    return
  }

  const convo = await loadOrCreateConversation(
    supabase,
    restaurantId,
    msg.from,
    timeoutMin,
  )

  convo.state.transcript.push({ role: 'guest', text: msg.text, at: msg.timestamp })

  // Extract structured booking fields from the conversation, grounded in the
  // restaurant's real zones + timezone. The phone is the WhatsApp number, not
  // something the model guesses.
  const ctx = await loadRestaurantContext(supabase, restaurantId)
  convo.state.draft = await extractDraft(convo.state.transcript, convo.state.draft, ctx)
  convo.state.draft.phone = msg.from

  // TODO (step 7): validate the assembled draft, run the availability engine and
  // duplicate check, and reply with i18n templates in the restaurant's language;
  // (step 8) insert on confirm and send the confirmation. For now, ask for the
  // next missing field so the multi-turn flow is exercisable.
  const reply = interimReply(convo.state.draft)

  convo.state.transcript.push({
    role: 'bot',
    text: reply,
    at: new Date().toISOString(),
  })
  await saveState(supabase, convo.id, convo.state)

  await provider.sendMessage({ to: msg.from, text: reply })
}

/**
 * Interim reply: acknowledge what was understood and ask for the next missing
 * required field. Deliberately plain English — step 7 replaces this with
 * localized templates that also reflect the availability check.
 */
function interimReply(draft: DraftFields): string {
  if (!draft.guestName) return "Happy to help with a booking! What name should it be under?"
  if (!draft.partySize) return `Thanks ${draft.guestName}. How many people?`
  if (!draft.dateTime) return "Great — what date and time would you like?"
  if (!draft.preferredZoneId) return "Any seating area preference?"
  return "Got everything — I'll confirm availability and get back to you shortly."
}
