// Meta Cloud API WhatsApp provider (Phase 12) — the production transport.
//
// STUB. The seam is wired (getProvider picks this when WHATSAPP_PROVIDER=meta)
// but the Graph API calls and HMAC verification are filled in during the
// end-to-end step against a real WhatsApp test number. It lives here now so the
// interface stays honest — nothing downstream changes when it's implemented,
// because it produces the same normalized InboundMessage / accepts the same
// OutboundMessage as the mock.
//
// Required secrets when this is enabled (set in the Supabase dashboard, never in
// code — see the manual test/setup plan):
//   WHATSAPP_VERIFY_TOKEN   — the token echoed during the GET webhook handshake
//   WHATSAPP_APP_SECRET     — Meta app secret; verifies the X-Hub-Signature-256 HMAC
//   WHATSAPP_ACCESS_TOKEN   — Graph API bearer token for sending messages
//   WHATSAPP_GRAPH_VERSION  — optional, e.g. "v21.0"

import type {
  InboundMessage,
  OutboundMessage,
  WhatsAppProvider,
} from './_provider.ts'

const NOT_IMPLEMENTED =
  'MetaWhatsAppProvider is not implemented yet — set WHATSAPP_PROVIDER=mock, ' +
  'or complete this provider in the end-to-end step.'

export class MetaWhatsAppProvider implements WhatsAppProvider {
  verifyWebhook(req: Request): Response | null {
    // Meta's GET handshake: echo hub.challenge when hub.verify_token matches.
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

  verifySignature(_req: Request, _rawBody: string): Promise<boolean> {
    // TODO: HMAC-SHA256 of rawBody with WHATSAPP_APP_SECRET, compared (constant
    // time) against the X-Hub-Signature-256 header.
    throw new Error(NOT_IMPLEMENTED)
  }

  parseInbound(_rawBody: string): InboundMessage[] {
    // TODO: walk entry[].changes[].value.messages[], map text messages to
    // InboundMessage, return [] for status/delivery callbacks.
    throw new Error(NOT_IMPLEMENTED)
  }

  sendMessage(_msg: OutboundMessage): Promise<void> {
    // TODO: POST to https://graph.facebook.com/<ver>/<phone_number_id>/messages
    // with the WHATSAPP_ACCESS_TOKEN bearer and a { type: "text" } body.
    throw new Error(NOT_IMPLEMENTED)
  }
}
