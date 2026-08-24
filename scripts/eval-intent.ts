// eval-intent.ts — a small intent-router eval harness (learning project).
//
// Replays scripted conversations through the REAL classifyIntent() — the same
// function the WhatsApp webhook uses to decide whether a message is a booking
// action or an informational question (the RAG branch). Sibling of
// eval-extraction.ts, for the routing step instead of the extraction step.
//
// Run:
//   ANTHROPIC_API_KEY=sk-ant-... deno run --allow-net --allow-env scripts/eval-intent.ts

import { classifyIntent } from '../supabase/functions/whatsapp-webhook/_intent.ts'
import type {
  MessageIntent,
} from '../supabase/functions/whatsapp-webhook/_intent.ts'
import type {
  RestaurantContext,
  TranscriptEntry,
} from '../supabase/functions/whatsapp-webhook/_store.ts'

// classifyIntent ignores ctx today; a minimal stand-in keeps the type happy.
const CTX = {
  zones: [{ id: 'zone-inside', name: 'Inside', smoking: 'non-smoking' }],
  timezone: 'Asia/Jerusalem',
} as unknown as RestaurantContext

interface Case {
  name: string
  /** Turns in order. role defaults to 'guest'; add a bot turn for context. */
  turns: ({ role: 'guest' | 'bot'; text: string } | string)[]
  expect: MessageIntent
}

const CASES: Case[] = [
  { name: 'pure booking — one message', turns: ['table for 4 tonight 8pm'], expect: 'booking' },
  { name: 'booking detail dribble', turns: ['hi', '6 people', 'tomorrow 7:30'], expect: 'booking' },
  { name: 'question — parking (en)', turns: ['do you have parking?'], expect: 'question' },
  { name: 'question — hours (he)', turns: ['פתוחים בשבת?'], expect: 'question' },
  { name: 'question — dietary', turns: ['is there anything vegan?'], expect: 'question' },
  { name: 'question — dogs (he)', turns: ['אפשר להביא כלב?'], expect: 'question' },
  {
    name: 'bare yes mid-booking is booking',
    turns: [{ role: 'bot', text: 'Confirm a table for 4 at 20:00?' }, 'yes'],
    expect: 'booking',
  },
  {
    name: 'both: booking + question -> booking',
    turns: ['table for 4 tonight, do you have parking?'],
    expect: 'booking',
  },
]

function toTranscript(turns: Case['turns']): TranscriptEntry[] {
  return turns.map((t) => {
    const e = typeof t === 'string' ? { role: 'guest' as const, text: t } : t
    return { ...e, at: new Date().toISOString() }
  })
}

let pass = 0
for (const c of CASES) {
  const got = await classifyIntent(toTranscript(c.turns), CTX)
  const ok = got === c.expect
  if (ok) pass++
  console.log(`${ok ? '✅' : '❌'} ${c.name}  (expected ${c.expect}, got ${got})`)
}
console.log(`\n${pass}/${CASES.length} passed`)
