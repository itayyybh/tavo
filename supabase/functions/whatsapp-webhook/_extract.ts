// LLM extraction for the WhatsApp channel (Phase 12).
//
// Turns the running conversation into structured booking fields, filling the
// SAME ReservationDraft the manual host form uses (no second draft schema). The
// model only extracts what the guest actually said; it never books, never
// invents a zone, and never bypasses a rule — validation, availability, and the
// insert are separate, deterministic steps that consume this draft.
//
// Grounded in real restaurant context: the bot is given the actual bookable zone
// names (so "outside" maps to a real zone id, and unknown zones are dropped) and
// the restaurant's timezone + the current time (so "tonight 8pm" resolves to a
// correct ISO datetime).
//
// Same shape as the parse-request function: Anthropic tool-calling for strict
// structured output, validated again server-side.
//
// Requires the ANTHROPIC_API_KEY secret (shared with parse-request):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>

import type { DraftFields, RestaurantContext, TranscriptEntry } from './_store.ts'

const MODEL = 'claude-haiku-4-5-20251001'

/** Fields the model returns. Zone comes back as a NAME, mapped to an id here. */
interface Extracted {
  guestName?: string
  partySize?: number
  dateTime?: string
  preferredZoneName?: string
  notes?: string
}

/**
 * Extract/refine the booking draft from the conversation so far. Returns the
 * MERGED draft (existing fields kept unless the guest updated them). `phone` and
 * `estimatedDuration` are set by the caller, not the model — the phone is the
 * WhatsApp number, and duration has a default.
 */
export async function extractDraft(
  transcript: TranscriptEntry[],
  current: DraftFields,
  ctx: RestaurantContext,
): Promise<DraftFields> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const zoneNames = ctx.zones.map((z) => z.name)
  const nowISO = new Date().toISOString()

  const system =
    'You extract restaurant booking details from a WhatsApp conversation between ' +
    'a guest and a booking assistant. Capture ONLY what the guest has actually ' +
    'stated or clearly confirmed — never guess a value that was not given. ' +
    'Resolve relative dates and times (e.g. "tonight", "tomorrow 8pm", "next ' +
    `Friday") against the current time and the restaurant timezone into a full ` +
    'ISO 8601 datetime with offset. For the zone, use ONLY a name from the ' +
    'provided list; if the guest asked for an area not in the list, omit it. ' +
    'Leave any field the guest has not provided unset.'

  const prompt =
    `Current time: ${nowISO}\n` +
    `Restaurant timezone: ${ctx.timezone ?? 'UTC'}\n` +
    `Bookable zones: ${JSON.stringify(zoneNames)}\n` +
    `Draft so far: ${JSON.stringify(current)}\n\n` +
    `Conversation (oldest first):\n` +
    transcript.map((t) => `${t.role === 'guest' ? 'Guest' : 'Assistant'}: ${t.text}`).join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system,
      tool_choice: { type: 'tool', name: 'record_booking' },
      tools: [
        {
          name: 'record_booking',
          description: 'Record the booking details stated so far in the conversation.',
          input_schema: {
            type: 'object',
            properties: {
              guestName: { type: 'string', description: 'The guest\'s name, if given.' },
              partySize: {
                type: 'integer',
                description: 'Number of people, if given.',
              },
              dateTime: {
                type: 'string',
                description: 'Full ISO 8601 datetime (with offset) of the booking, if a date and time were given.',
              },
              preferredZoneName: {
                type: 'string',
                enum: zoneNames,
                description: 'Requested seating area — only from the provided list.',
              },
              notes: {
                type: 'string',
                description: 'Any extra requests (occasion, allergies, seating wishes).',
              },
            },
            required: [],
          },
        },
      ],
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic error ${res.status}`)
  const data = await res.json()
  const block = (data.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
  const raw = (block?.input ?? {}) as Extracted

  return mergeDraft(current, raw, ctx)
}

/**
 * Merge extracted values over the existing draft, keeping prior fields when the
 * model returns nothing for them. Validates the zone name against the real list
 * (drops anything invented) and maps it to a zone id.
 */
function mergeDraft(
  current: DraftFields,
  raw: Extracted,
  ctx: RestaurantContext,
): DraftFields {
  const next: DraftFields = { ...current }

  if (typeof raw.guestName === 'string' && raw.guestName.trim()) {
    next.guestName = raw.guestName.trim()
  }
  if (Number.isFinite(raw.partySize) && (raw.partySize as number) > 0) {
    next.partySize = Math.floor(raw.partySize as number)
  }
  if (typeof raw.dateTime === 'string' && !Number.isNaN(Date.parse(raw.dateTime))) {
    next.dateTime = raw.dateTime
  }
  if (typeof raw.preferredZoneName === 'string') {
    const zone = ctx.zones.find(
      (z) => z.name.toLowerCase() === raw.preferredZoneName!.trim().toLowerCase(),
    )
    if (zone) next.preferredZoneId = zone.id
  }
  if (typeof raw.notes === 'string' && raw.notes.trim()) {
    next.notes = raw.notes.trim()
  }

  return next
}
