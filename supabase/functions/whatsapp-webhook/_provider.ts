// WhatsApp provider seam (Phase 12).
//
// The transport boundary for the WhatsApp channel. Everything above this line —
// conversation state, LLM extraction, validation, availability, insert — deals
// ONLY in the normalized types below and the `WhatsAppProvider` interface. It
// never sees Meta's webhook JSON or Graph API shapes. That is what lets the mock
// provider (local dev / tests) be swapped for the real Meta Cloud API provider
// without touching a single line of reservation or LLM logic.
//
// Rule that keeps the seam honest: no provider-specific field may leak into
// `InboundMessage` / `OutboundMessage`. If Meta needs something extra to send a
// reply (e.g. a message id to quote), it stays inside the Meta provider.

/** A single inbound guest message, normalized across providers. */
export interface InboundMessage {
  /**
   * The business number the message arrived on (Meta's stable `phone_number_id`).
   * This — not the guest's number — resolves tenancy via `whatsapp_channels`.
   */
  phoneNumberId: string
  /** Guest's WhatsApp number in E.164 (e.g. "+972501234567"). The conversation key. */
  from: string
  /** Plain message text. MVP handles text only; media/location are ignored upstream. */
  text: string
  /** Provider message id — used for idempotency (don't process the same message twice). */
  messageId: string
  /** ISO timestamp the message was sent. */
  timestamp: string
}

/** A reply to send back to the guest. Text only for MVP. */
export interface OutboundMessage {
  /** Guest number in E.164. */
  to: string
  text: string
}

/**
 * The transport a WhatsApp channel needs. Four methods, all provider-specific:
 * webhook verification handshake, inbound authenticity, inbound parsing, and
 * outbound send. Implemented by the mock (dev/tests) and, later, Meta Cloud API.
 */
export interface WhatsAppProvider {
  /**
   * Handle the provider's GET verification handshake (Meta posts `hub.challenge`
   * once when the webhook URL is registered). Returns a `Response` to reply with,
   * or `null` if this GET isn't a verification request.
   */
  verifyWebhook(req: Request): Response | null

  /**
   * Confirm an inbound POST actually came from the provider (Meta signs the body
   * with an app secret; HMAC-SHA256). `rawBody` is the exact bytes as received —
   * the signature is computed over them, so it must be read before JSON parsing.
   */
  verifySignature(req: Request, rawBody: string): Promise<boolean>

  /**
   * Parse a raw inbound webhook body into zero or more normalized messages.
   * Non-message events (delivery receipts, status callbacks) parse to `[]`.
   */
  parseInbound(rawBody: string): InboundMessage[]

  /** Send a text reply to the guest. */
  sendMessage(msg: OutboundMessage): Promise<void>
}

/**
 * Select the provider from the environment so deploys switch transport without a
 * code change. `WHATSAPP_PROVIDER=meta` in production; anything else (or unset)
 * uses the mock, so local `supabase functions serve` and tests work out of the
 * box. Imports are lazy/dynamic so the mock never pulls in Meta config and vice
 * versa.
 */
export async function getProvider(): Promise<WhatsAppProvider> {
  const kind = Deno.env.get('WHATSAPP_PROVIDER') ?? 'mock'
  if (kind === 'meta') {
    const { MetaWhatsAppProvider } = await import('./_provider.meta.ts')
    return new MetaWhatsAppProvider()
  }
  const { MockWhatsAppProvider } = await import('./_provider.mock.ts')
  return new MockWhatsAppProvider()
}
