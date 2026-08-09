// Meta Cloud API WhatsApp provider (Phase 12) — the production transport.
//
// Implements the WhatsAppProvider seam against Meta's WhatsApp Cloud API. Nothing
// downstream changes when this replaces the mock: it produces the same normalized
// InboundMessage and accepts the same OutboundMessage. Selected by
// WHATSAPP_PROVIDER=meta (see _provider.ts / getProvider).
//
// Required secrets (Supabase dashboard → Edge Functions → Secrets — never in
// code; see the setup doc):
//   WHATSAPP_VERIFY_TOKEN     token echoed during the GET webhook handshake
//   WHATSAPP_APP_SECRET       Meta app secret; verifies the X-Hub-Signature-256 HMAC
//   WHATSAPP_ACCESS_TOKEN     Graph API bearer token for sending messages
//   WHATSAPP_PHONE_NUMBER_ID  the business number's id (the send endpoint path)
//   WHATSAPP_GRAPH_VERSION    optional Graph API version, default "v21.0"

import type {
  InboundMessage,
  OutboundMessage,
  WhatsAppProvider,
} from './_provider.ts'

export class MetaWhatsAppProvider implements WhatsAppProvider {
  /** Meta's GET handshake: echo hub.challenge when hub.verify_token matches. */
  verifyWebhook(req: Request): Response | null {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode !== 'subscribe' || challenge === null) return null
    const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN')
    if (!expected || token !== expected) {
      return new Response('Forbidden', { status: 403 })
    }
    return new Response(challenge, { status: 200 })
  }

  /**
   * Verify the X-Hub-Signature-256 header: HMAC-SHA256 of the raw body with the
   * app secret, compared in constant time. Fails closed if the secret or header
   * is missing.
   */
  async verifySignature(req: Request, rawBody: string): Promise<boolean> {
    const secret = Deno.env.get('WHATSAPP_APP_SECRET')
    if (!secret) return false
    const header = req.headers.get('x-hub-signature-256')
    if (!header?.startsWith('sha256=')) return false
    const expectedHex = header.slice('sha256='.length)

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
    const actualHex = [...new Uint8Array(sig)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    return timingSafeEqual(actualHex, expectedHex)
  }

  /**
   * Map Meta's webhook envelope to normalized text messages. Walks
   * entry[].changes[].value.messages[]; status/delivery callbacks (no messages)
   * and non-text message types yield nothing.
   */
  parseInbound(rawBody: string): InboundMessage[] {
    let body: MetaWebhook
    try {
      body = JSON.parse(rawBody)
    } catch {
      return []
    }
    const out: InboundMessage[] = []
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        const phoneNumberId = value?.metadata?.phone_number_id
        if (!phoneNumberId) continue
        for (const m of value.messages ?? []) {
          if (m.type !== 'text' || !m.text?.body) continue
          out.push({
            phoneNumberId,
            from: normalizeE164(m.from),
            text: m.text.body,
            messageId: m.id,
            timestamp: m.timestamp
              ? new Date(Number(m.timestamp) * 1000).toISOString()
              : new Date().toISOString(),
          })
        }
      }
    }
    return out
  }

  /** Send a text reply via the Graph API. */
  async sendMessage(msg: OutboundMessage): Promise<void> {
    const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
    if (!token || !phoneNumberId) {
      throw new Error('WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set')
    }
    const version = Deno.env.get('WHATSAPP_GRAPH_VERSION') ?? 'v21.0'
    const res = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: msg.to,
          type: 'text',
          text: { body: msg.text },
        }),
      },
    )
    if (!res.ok) {
      throw new Error(`Graph API send failed ${res.status}: ${await res.text()}`)
    }
  }
}

// --- Meta webhook payload (only the fields used) --------------------------------
interface MetaWebhook {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string }
        messages?: Array<{
          from: string
          id: string
          timestamp?: string
          type?: string
          text?: { body?: string }
        }>
      }
    }>
  }>
}

/** WhatsApp gives the sender as digits (no +); store E.164 for a stable key. */
function normalizeE164(from: string): string {
  return from.startsWith('+') ? from : `+${from}`
}

/** Constant-time string compare (avoids leaking the signature via timing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
