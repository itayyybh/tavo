// Mock WhatsApp provider (Phase 12) — the default transport for local dev and
// tests. Speaks a simple, hand-writable JSON shape instead of Meta's nested
// webhook envelope, so the whole booking flow can be exercised with `curl`
// against `supabase functions serve` — no Meta account, no tunnel, no signing.
//
// Outbound replies are logged and pushed to an in-memory outbox so a test
// harness can assert what the bot said. The outbox lives for the duration of one
// function invocation (Edge Functions are stateless between requests) — that's
// enough to inspect the reply produced for a given inbound message.

import type {
  InboundMessage,
  OutboundMessage,
  WhatsAppProvider,
} from './_provider.ts'

/**
 * The inbound JSON the mock accepts. Deliberately flat and minimal — this is the
 * normalized `InboundMessage` minus the fields the mock can synthesize.
 *
 *   { "phoneNumberId": "test-1", "from": "+972500000000", "text": "table for 4 tonight 8pm" }
 */
interface MockInbound {
  phoneNumberId: string
  from: string
  text: string
  messageId?: string
  timestamp?: string
}

/** Captured outbound replies for the current invocation (test assertions). */
export const mockOutbox: OutboundMessage[] = []

export class MockWhatsAppProvider implements WhatsAppProvider {
  /**
   * Mirror Meta's GET handshake so the same verify-token wiring is exercised
   * locally: echo `hub.challenge` when `hub.verify_token` matches the configured
   * token. Any non-verification GET returns null.
   */
  verifyWebhook(req: Request): Response | null {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode !== 'subscribe' || challenge === null) return null
    const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN')
    if (expected && token !== expected) {
      return new Response('Forbidden', { status: 403 })
    }
    return new Response(challenge, { status: 200 })
  }

  /**
   * Optional shared-secret check so signature-rejection paths can be tested. If
   * `WHATSAPP_MOCK_SECRET` is set, the inbound must carry a matching
   * `x-mock-signature` header; otherwise everything is accepted.
   */
  verifySignature(req: Request, _rawBody: string): Promise<boolean> {
    const secret = Deno.env.get('WHATSAPP_MOCK_SECRET')
    if (!secret) return Promise.resolve(true)
    return Promise.resolve(req.headers.get('x-mock-signature') === secret)
  }

  /** Parse the flat mock JSON. Anything without a `text` body yields no message. */
  parseInbound(rawBody: string): InboundMessage[] {
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return []
    }
    const m = body as MockInbound
    if (!m || typeof m.phoneNumberId !== 'string' || typeof m.from !== 'string') {
      return []
    }
    if (typeof m.text !== 'string' || !m.text.trim()) return []
    return [
      {
        phoneNumberId: m.phoneNumberId,
        from: m.from,
        text: m.text,
        messageId: m.messageId ?? crypto.randomUUID(),
        timestamp: m.timestamp ?? new Date().toISOString(),
      },
    ]
  }

  /** "Send" by logging + capturing. Lets a local tester read the bot's reply. */
  sendMessage(msg: OutboundMessage): Promise<void> {
    mockOutbox.push(msg)
    console.log(`[mock whatsapp] -> ${msg.to}: ${msg.text}`)
    return Promise.resolve()
  }

  /** Return + clear the replies captured this request (for the local chat client). */
  drainOutbox(): OutboundMessage[] {
    return mockOutbox.splice(0, mockOutbox.length)
  }
}
