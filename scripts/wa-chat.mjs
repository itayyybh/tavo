#!/usr/bin/env node
// Local WhatsApp chat client (Phase 12) — talk to the whatsapp-webhook function
// as if you were a guest on WhatsApp. Works only with the MOCK provider, which
// echoes the bot's replies in the HTTP response (real transports send over the
// wire). Purely a dev/test convenience; ships nothing to production.
//
// Prereqs:
//   1. Map a test number to your restaurant (SQL editor):
//        insert into whatsapp_channels (restaurant_id, phone_number_id)
//        values ('<restaurant-id>', 'test-1');
//   2. Serve the function with the mock provider + ANTHROPIC_API_KEY set:
//        supabase functions serve whatsapp-webhook --no-verify-jwt \
//          --env-file supabase/functions/.env
//
// Run:
//   node scripts/wa-chat.mjs
//
// Env overrides:
//   FN_URL            default http://localhost:54321/functions/v1/whatsapp-webhook
//   PHONE_NUMBER_ID   default test-1   (must match your whatsapp_channels row)
//   FROM              default +972500000000  (the guest number = conversation key)
//
// Commands:
//   /new [number]   start a fresh conversation (new guest number)
//   /quit           exit

import readline from 'node:readline'

const FN_URL =
  process.env.FN_URL ??
  'http://localhost:54321/functions/v1/whatsapp-webhook'
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID ?? 'test-1'
let from = process.env.FROM ?? '+972500000000'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((res) => rl.question(q, res))

async function send(text) {
  let res
  try {
    res = await fetch(FN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumberId: PHONE_NUMBER_ID, from, text }),
    })
  } catch (err) {
    console.log(`\n  ⚠️  can't reach ${FN_URL} — is \`supabase functions serve\` running?`)
    console.log(`      ${err.message}\n`)
    return
  }
  if (!res.ok) {
    console.log(`\n  ⚠️  ${res.status} ${res.statusText}: ${await res.text()}\n`)
    return
  }
  let body
  try {
    body = await res.json()
  } catch {
    console.log('\n  ⚠️  no JSON reply — is WHATSAPP_PROVIDER=mock?\n')
    return
  }
  const replies = body.replies ?? []
  if (replies.length === 0) {
    console.log('  (no reply)')
    return
  }
  for (const r of replies) console.log(`bot> ${r.text}`)
}

console.log('WhatsApp mock chat — type a message, /new for a fresh guest, /quit to exit.')
console.log(`guest ${from} · number ${PHONE_NUMBER_ID} · ${FN_URL}\n`)

for (;;) {
  const line = (await ask('you> ')).trim()
  if (!line) continue
  if (line === '/quit' || line === '/exit') break
  if (line.startsWith('/new')) {
    const arg = line.split(/\s+/)[1]
    from = arg ?? `+9725${Math.floor(10000000 + Math.random() * 89999999)}`
    console.log(`  → new conversation as ${from}\n`)
    continue
  }
  await send(line)
}

rl.close()
