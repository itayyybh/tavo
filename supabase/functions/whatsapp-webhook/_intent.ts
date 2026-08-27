// Message intent routing for the WhatsApp channel (Phase 12 — RAG prep).
//
// The bot's default job is booking: it runs the conversation through
// `extractDraft` and advances a reservation. But guests also ask plain
// INFORMATIONAL questions ("do you have parking?", "פתוחים בשבת?") that have
// nothing to do with making a booking. This classifier is the router that tells
// those two apart, so an informational question can be answered from the
// restaurant's facts (RAG) instead of being force-fit into the booking flow.
//
// Deliberately biased toward 'booking': we only return 'question' when the
// message is CLEARLY informational and is NOT also providing booking details.
// When unsure we fall back to 'booking' — that is the bot's existing behaviour,
// so a misclassification here can never make things worse than today.
//
// Same shape as `extractDraft`: Anthropic tool-calling for strict, enum-checked
// output. Shares the ANTHROPIC_API_KEY secret.

import type { RestaurantContext, TranscriptEntry } from './_store.ts'

const MODEL = 'claude-haiku-4-5-20251001'

/** What the guest's latest message is trying to do. */
export type MessageIntent = 'booking' | 'question'

/**
 * Classify the guest's latest message as a booking action or an informational
 * question. The full transcript is passed so a short message can be read in
 * context (e.g. a bare "yes" continuing a booking is 'booking', not 'question').
 *
 * Callers should skip this when already awaiting a booking confirmation — that
 * turn is handled deterministically by the flow, not routed here.
 *
 * Any API/parse failure resolves to 'booking' (the safe default), so the router
 * can never break the guest's conversation.
 */
export async function classifyIntent(
  transcript: TranscriptEntry[],
  _ctx: RestaurantContext,
): Promise<MessageIntent> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const system =
    'You route messages in a restaurant WhatsApp assistant. Classify the ' +
    "guest's LATEST message as one of:\n" +
    "- 'booking': the guest wants to make, change, or confirm a reservation, or " +
    'is providing booking details (name, party size, date/time, seating area), ' +
    'or is answering the assistant’s booking questions (including "yes"/"no").\n' +
    "- 'question': the guest is asking for general information about the " +
    'restaurant — hours, location, parking, menu, dietary options, amenities ' +
    '(wifi, dogs, smoking area), or policies — and is NOT trying to book.\n' +
    'Use the conversation for context: a short reply during an active booking is ' +
    "'booking'. If a message BOTH asks a question AND gives booking details, " +
    "choose 'booking'. When unsure, choose 'booking'."

  const prompt =
    'Conversation (oldest first):\n' +
    transcript
      .map((t) => `${t.role === 'guest' ? 'Guest' : 'Assistant'}: ${t.text}`)
      .join('\n') +
    '\n\nClassify the LATEST Guest message.'

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 100,
        system,
        tool_choice: { type: 'tool', name: 'classify_message' },
        tools: [
          {
            name: 'classify_message',
            description: "Record the intent of the guest's latest message.",
            input_schema: {
              type: 'object',
              properties: {
                intent: {
                  type: 'string',
                  enum: ['booking', 'question'],
                  description:
                    "'question' only for pure informational requests; otherwise 'booking'.",
                },
              },
              required: ['intent'],
            },
          },
        ],
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) return 'booking'
    const data = await res.json()
    const block = (data.content ?? []).find(
      (b: { type: string }) => b.type === 'tool_use',
    )
    const intent = block?.input?.intent
    return intent === 'question' ? 'question' : 'booking'
  } catch {
    // Never let a routing failure break the conversation — fall back to booking.
    return 'booking'
  }
}
