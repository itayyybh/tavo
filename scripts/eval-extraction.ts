// eval-extraction.ts — a small LLM-extraction eval harness (learning project).
//
// Replays a handful of scripted guest conversations through the REAL
// extractDraft() — the exact same function index.ts calls on every inbound
// WhatsApp message — and checks the final draft against what a correct
// extraction should produce. This is not a full test suite; it's a
// lightweight way to eyeball extraction accuracy on realistic transcripts,
// especially before/after changing the prompt in _extract.ts. Same idea as
// `seating_decisions` grading the seating engine's picks — just for the
// WhatsApp LLM step instead, and running locally rather than logged to a
// table (see whatsapp_extraction_log for the "log real traffic" half of
// this).
//
// Run:
//   ANTHROPIC_API_KEY=sk-ant-... deno run --allow-net --allow-env scripts/eval-extraction.ts

import { extractDraft } from '../supabase/functions/whatsapp-webhook/_extract.ts'
import type {
  DraftFields,
  RestaurantContext,
  TranscriptEntry,
} from '../supabase/functions/whatsapp-webhook/_store.ts'

// A small fixed set of bookable zones standing in for a real restaurant's
// `zones` table. Swap these for your actual Tavo zone names/ids if you want
// to eval against your real config instead of this generic stand-in.
const CTX: RestaurantContext = {
  zones: [
    { id: 'zone-inside', name: 'Inside', smoking: 'non-smoking' },
    { id: 'zone-outside-smoking', name: 'Outside Smoking', smoking: 'smoking' },
    { id: 'zone-outside-nonsmoking', name: 'Outside Non-Smoking', smoking: 'non-smoking' },
  ],
  timezone: 'Asia/Jerusalem',
}

interface Case {
  name: string
  /** Guest messages only, in order — a bot reply isn't needed for extraction. */
  turns: string[]
  /** Fields the final draft should end up with. Empty = "nothing should change." */
  expect: Partial<DraftFields>
  /** Fields to skip comparing (e.g. dateTime, which depends on "now"). */
  ignore?: (keyof DraftFields)[]
}

const CASES: Case[] = [
  {
    name: 'happy path — everything in one message',
    turns: ['table for 4 tomorrow 8pm inside, ask for Dana'],
    expect: { guestName: 'Dana', partySize: 4, preferredZoneId: 'zone-inside' },
    ignore: ['dateTime'],
  },
  {
    name: 'multi-turn — fields dribbled across messages',
    turns: ['hi', 'Yossi', '6 people', 'tomorrow at 7:30', 'inside please'],
    expect: { guestName: 'Yossi', partySize: 6, preferredZoneId: 'zone-inside' },
    ignore: ['dateTime'],
  },
  {
    name: 'out-of-order + revised answer',
    turns: ['table for 2', 'actually make that 5, and outside smoking, tonight 9pm, name Noa'],
    expect: { guestName: 'Noa', partySize: 5, preferredZoneId: 'zone-outside-smoking' },
    ignore: ['dateTime'],
  },
  {
    name: 'ambiguous zone — needs smoking disambiguation',
    turns: ['table for 2 tomorrow 8pm outside'],
    expect: { needsSmokingChoice: true },
  },
  {
    name: 'irrelevant message — nothing should be extracted',
    turns: ['do you guys have live music on weekends?'],
    expect: { needsSmokingChoice: false },
  },
  {
    name: 'Hebrew input',
    turns: ['שולחן ל-3 מחר ב-20:00 בפנים, השם דנה'],
    expect: { guestName: 'דנה', partySize: 3, preferredZoneId: 'zone-inside' },
    ignore: ['dateTime'],
  },
  {
    name: 'party size spelled out, not a digit',
    turns: ['table for three tonight, name Avi'],
    expect: { guestName: 'Avi', partySize: 3 },
    ignore: ['dateTime'],
  },
  {
    name: 'booking info mixed with an off-topic question',
    turns: ['do you have parking? table for 2 tomorrow 7pm, name Ron'],
    expect: { guestName: 'Ron', partySize: 2 },
    ignore: ['dateTime'],
  },
  {
    name: 'explicit non-smoking outside — no disambiguation needed',
    turns: ['table for 2 tomorrow 8pm outside, non smoking'],
    expect: { partySize: 2, preferredZoneId: 'zone-outside-nonsmoking', needsSmokingChoice: false },
    ignore: ['dateTime'],
  },
]

function pick<T extends object>(obj: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {}
  for (const k of keys) out[k] = obj[k]
  return out
}

async function runCase(c: Case): Promise<boolean> {
  let draft: DraftFields = {}
  const transcript: TranscriptEntry[] = []
  for (const text of c.turns) {
    transcript.push({ role: 'guest', text, at: new Date().toISOString() })
    draft = await extractDraft(transcript, draft, CTX)
  }

  const ignore = c.ignore ?? []
  const expectKeys = Object.keys(c.expect) as (keyof DraftFields)[]
  let ok: boolean
  let actual: Partial<DraftFields>
  let expected: Partial<DraftFields>

  if (expectKeys.length > 0) {
    const relevantKeys = expectKeys.filter((k) => !ignore.includes(k))
    actual = pick(draft, relevantKeys)
    expected = pick(c.expect, relevantKeys)
    ok = JSON.stringify(actual) === JSON.stringify(expected)
  } else {
    // Nothing expected to change — the draft (minus ignored keys) should be empty.
    const draftKeys = (Object.keys(draft) as (keyof DraftFields)[]).filter(
      (k) => !ignore.includes(k),
    )
    actual = pick(draft, draftKeys)
    expected = {}
    ok = draftKeys.length === 0
  }

  console.log(`${ok ? '✅' : '❌'} ${c.name}`)
  if (!ok) {
    console.log('   expected:', expected)
    console.log('   actual:  ', actual)
    console.log('   full draft:', draft)
  }
  return ok
}

let passed = 0
for (const c of CASES) {
  if (await runCase(c)) passed++
}
console.log(`\n${passed}/${CASES.length} passed`)
if (passed < CASES.length) Deno.exit(1)
