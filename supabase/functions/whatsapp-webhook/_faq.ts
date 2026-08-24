// FAQ answering for the WhatsApp channel (Phase 12 — RAG branch).
//
// When the intent router (_intent.ts) tags a guest message as an informational
// 'question' rather than a booking, this module answers it from the restaurant's
// own facts — the "retrieval-augmented generation" (RAG) path.
//
// MVP note — why there is no vector search here yet:
//   RAG's retrieval step exists to shrink a LARGE fact corpus down to what fits
//   in the prompt. This corpus is a handful of facts, so there is nothing to
//   shrink: we hand ALL facts to the model and let it answer. Embeddings /
//   pgvector only earn their place once the corpus outgrows the context window.
//   Structuring it this way now means the swap later is local to buildCorpus().
//
// Two kinds of facts (see also scripts/rag-practice.mjs):
//   1. OPERATIONAL — hours, party-size rules. DERIVED from restaurant_settings so
//      they never drift from what the app actually enforces.
//   2. PROSE — address, parking, amenities. Not in the data model yet; hardcoded
//      here for MVP. Real home later: a `restaurant_info` table, one row per fact.
//
// Shares the ANTHROPIC_API_KEY secret with _extract.ts / _intent.ts.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Lang } from './_reply.ts'

const MODEL = 'claude-haiku-4-5-20251001'

// Weekday index 0 = Sunday ... 6 = Saturday (matches the app's Weekday type).
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface DayHours {
  open: boolean
  from: string
  to: string
  lastSeating: string | null
}
interface ReservationRules {
  minPartySize?: number
  maxPartySize?: number
}

/**
 * Prose facts not stored in the data model. TODO: move to a `restaurant_info`
 * table (host-editable, one row per fact) so this is per-restaurant, not global.
 */
const PROSE_FACTS = [
  'We are located at Nahalat Itzhak 18, Tel Aviv.',
  'There is a paid underground parking lot, and the surrounding neighborhood has street parking nearby.',
  'We have vegan, vegetarian, and gluten-free options, including tofu dishes and gluten-free bread and meals.',
  'You can make a reservation by phone call or through our WhatsApp bot.',
  'We are dog-friendly — dogs are welcome both inside and outside.',
  'We have free WiFi available.',
  'There is outdoor seating with both a smoking area and a non-smoking area.',
]

/** Turn structured opening hours + party rules into natural-language facts. */
function deriveOperationalFacts(
  openingHours: DayHours[],
  rules: ReservationRules,
): string[] {
  const facts: string[] = []

  // Group open days sharing the same window so identical days collapse.
  const byWindow = new Map<string, string[]>()
  openingHours.forEach((d, day) => {
    if (!d?.open) return
    const key = `${d.from}-${d.to}`
    if (!byWindow.has(key)) byWindow.set(key, [])
    byWindow.get(key)!.push(WEEKDAYS[day])
  })
  for (const [key, names] of byWindow) {
    const [from, to] = key.split('-')
    facts.push(`We are open ${names.join(', ')} from ${from} to ${to}.`)
  }

  const closed = openingHours
    .map((d, day) => (d?.open ? null : WEEKDAYS[day]))
    .filter((n): n is string => n !== null)
  if (closed.length) facts.push(`We are closed on ${closed.join(', ')}.`)

  const { minPartySize, maxPartySize } = rules
  if (typeof minPartySize === 'number' && typeof maxPartySize === 'number') {
    facts.push(`We accept reservations for parties of ${minPartySize} to ${maxPartySize} guests.`)
  }
  return facts
}

/**
 * Build the full fact corpus: operational facts derived from the restaurant's
 * settings + the prose facts. A missing/failed settings load degrades to prose
 * only rather than throwing.
 */
async function buildCorpus(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<string[]> {
  let operational: string[] = []
  const { data } = await supabase
    .from('restaurant_settings')
    .select('opening_hours, reservation_rules')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (data) {
    // Pull the jsonb columns through `unknown` — the client's schema generics
    // don't describe these tables, so cast structurally at the boundary.
    const row = data as unknown as {
      opening_hours: DayHours[] | null
      reservation_rules: ReservationRules | null
    }
    operational = deriveOperationalFacts(
      row.opening_hours ?? [],
      row.reservation_rules ?? {},
    )
  }
  return [...operational, ...PROSE_FACTS]
}

/**
 * Answer an informational guest question from the restaurant's facts, in the
 * guest's language. Grounded: the model must answer ONLY from the provided
 * facts, and say it is not sure (offering to pass the guest to the staff) when
 * the facts do not cover the question — never invent hours, prices, or policy.
 */
export async function answerFromFaq(
  supabase: SupabaseClient,
  restaurantId: string,
  question: string,
  lang: Lang,
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const facts = await buildCorpus(supabase, restaurantId)
  const langName = lang === 'he' ? 'Hebrew' : 'English'

  const system =
    `You are a restaurant's WhatsApp assistant. Answer the guest's question ` +
    `using ONLY the facts provided below. Do NOT invent hours, prices, menu ` +
    `items, or policies. If the facts do not cover the question, say you are ` +
    `not sure and offer to have a team member follow up. Reply in ${langName}, ` +
    `in one or two short, friendly sentences.\n\n` +
    `Facts:\n${facts.map((f) => `- ${f}`).join('\n')}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 250,
      system,
      messages: [{ role: 'user', content: question }],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic error ${res.status}`)
  const data = await res.json()
  const text = (data.content ?? []).find((b: { type: string }) => b.type === 'text')?.text
  return typeof text === 'string' && text.trim()
    ? text.trim()
    : lang === 'he'
      ? 'סליחה, לא בטוח לגבי זה — אעביר לצוות שיחזור אליך.'
      : "Sorry, I'm not sure about that — I'll have a team member follow up."
}
