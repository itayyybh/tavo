// rag-practice.mjs — standalone RAG practice script (learning project).
//
// Not wired into the WhatsApp bot. Just the core RAG loop in isolation:
//   1. Embed a small set of FAQ entries (once, up front).
//   2. Embed a guest-style question.
//   3. Find the closest FAQ entries by cosine similarity ("retrieval").
//   4. Hand those entries to Claude and ask it to answer using only them
//      ("augmented generation").
//
// Swap the FAQ array below for Cafe Jolie's real hours/parking/menu info
// once this works end to end.
//
// Embeddings run locally via @xenova/transformers (multilingual MiniLM-L12,
// Hebrew<->English capable). No embeddings API key needed — the model
// downloads once, then runs offline.
//
// Run:
//   ANTHROPIC_API_KEY=... node scripts/rag-practice.mjs "do you have parking?"

import { pipeline } from '@xenova/transformers'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_KEY) throw new Error('Set ANTHROPIC_API_KEY')

const question = process.argv[2]
if (!question) throw new Error('Usage: node scripts/rag-practice.mjs "your question"')

// ---------------------------------------------------------------------------
// Two kinds of facts:
//
//   1. OPERATIONAL — hours, party-size rules. These already live in the app's
//      RestaurantSettingsConfig (src/types/index.ts). We DERIVE fact sentences
//      from that config instead of retyping them, so the bot's answers stay in
//      sync automatically: change hours in Settings -> the fact changes too.
//
//   2. PROSE — address, parking, amenities. Not in the data model. In the real
//      app these would live in a `restaurant_info` table; here they're literals.
//
// The RAG corpus is the two lists concatenated.
// ---------------------------------------------------------------------------

// Weekday index 0 = Sunday ... 6 = Saturday (matches the app's `Weekday` type).
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// A stand-in for the real RestaurantSettingsConfig slice we care about. In the
// app this comes from settingsStore / Supabase — same shape, real values.
const SETTINGS = {
  // openingHours: one DayHours per weekday, indexed by Weekday.
  openingHours: [
    { open: true, from: '09:00', to: '23:00', lastSeating: null }, // Sun
    { open: true, from: '09:00', to: '23:00', lastSeating: null }, // Mon
    { open: true, from: '09:00', to: '23:00', lastSeating: null }, // Tue
    { open: true, from: '09:00', to: '23:00', lastSeating: null }, // Wed
    { open: true, from: '09:00', to: '23:00', lastSeating: null }, // Thu
    { open: true, from: '09:00', to: '23:00', lastSeating: null }, // Fri
    { open: true, from: '11:00', to: '23:00', lastSeating: null }, // Sat (opens later)
  ],
  reservationRules: { minPartySize: 1, maxPartySize: 12 },
}

/**
 * Turn structured settings into natural-language fact sentences for retrieval.
 * Open days that share the same window are grouped into one fact.
 */
function deriveOperationalFacts(config) {
  const facts = []
  const days = config.openingHours.map((d, day) => ({ ...d, day }))

  // Group open days by their "from-to" window so identical days collapse.
  const byWindow = new Map()
  for (const d of days.filter((d) => d.open)) {
    const key = `${d.from}-${d.to}`
    if (!byWindow.has(key)) byWindow.set(key, [])
    byWindow.get(key).push(WEEKDAYS[d.day])
  }
  for (const [key, names] of byWindow) {
    const [from, to] = key.split('-')
    facts.push(`We are open ${names.join(', ')} from ${from} to ${to}.`)
  }

  const closed = days.filter((d) => !d.open).map((d) => WEEKDAYS[d.day])
  if (closed.length) facts.push(`We are closed on ${closed.join(', ')}.`)

  const { minPartySize, maxPartySize } = config.reservationRules
  facts.push(`We accept reservations for parties of ${minPartySize} to ${maxPartySize} guests.`)

  return facts
}

// Prose facts — not stored in the app's data model (would be a restaurant_info table).
const PROSE_FACTS = [
  'We are located at Nahalat Itzhak 18, Tel Aviv.',
  'There is a paid underground parking lot, and the surrounding neighborhood has street parking nearby.',
  'We have vegan, vegetarian, and gluten-free options, including tofu dishes and gluten-free bread and meals.',
  'You can make a reservation by phone call or through our WhatsApp bot.',
  'We are dog-friendly — dogs are welcome both inside and outside.',
  'We have free WiFi available.',
  'There is outdoor seating with both a smoking area and a non-smoking area.',
]

// The retrieval corpus: derived operational facts + prose facts.
const FAQ = [...deriveOperationalFacts(SETTINGS), ...PROSE_FACTS]

// Local embedder — loaded once, reused. mean-pooled + L2-normalized so each
// text becomes one unit vector (cosine similarity = dot product).
let embedder
async function embed(texts) {
  if (!embedder) {
    // Multilingual model — handles Hebrew<->English so guest questions in
    // Hebrew match English facts by meaning. (English-only models can't.)
    embedder = await pipeline(
      'feature-extraction',
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    )
  }
  const output = await embedder(texts, { pooling: 'mean', normalize: true })
  return output.tolist() // -> [[...384 floats], ...] one row per input text
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

async function askClaude(context, question) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system:
        'Answer the guest question using ONLY the provided restaurant facts. ' +
        'If the facts do not cover it, say you are not sure and offer to check.',
      messages: [
        {
          role: 'user',
          content: `Restaurant facts:\n${context.join('\n')}\n\nGuest question: ${question}`,
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.content.find((b) => b.type === 'text')?.text ?? '(no text response)'
}

// 1. Embed the FAQ (retrieval corpus) and the question, in one batch call each.
const faqEmbeddings = await embed(FAQ)
const [questionEmbedding] = await embed([question])

// 2. Retrieval — rank FAQ entries by similarity to the question.
const ranked = FAQ.map((text, i) => ({
  text,
  score: cosineSimilarity(questionEmbedding, faqEmbeddings[i]),
})).sort((a, b) => b.score - a.score)

console.log('Top matches:')
for (const r of ranked.slice(0, 3)) {
  console.log(`  ${r.score.toFixed(3)}  ${r.text}`)
}

// 3. Augmented generation — answer using only the top matches.
const topContext = ranked.slice(0, 3).map((r) => r.text)
const answer = await askClaude(topContext, question)
console.log('\nAnswer:', answer)
