// Supabase Edge Function (Phase 9) — server-side availability, final authority.
//
// Verifies the caller, derives their restaurant from membership (never trusts
// the body for tenancy), reads the LATEST layout + reservations + settings from
// the database (RLS-scoped to that restaurant via the caller's token), and runs
// the SAME seating engine as the client — bundled into ./_engine.mjs by esbuild
// (`npm run build:edge`). Returns { available, reason }.
//
// Deploy:  supabase functions deploy check-availability --project-ref <ref>
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { evaluateAvailability } from './_engine.mjs'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Not authenticated' }, 401)

    // Caller-scoped client: RLS limits every read below to the caller's restaurant.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return json({ error: 'Not authenticated' }, 401)

    // Tenancy comes from membership, never from the request body.
    const { data: membership } = await supabase
      .from('memberships')
      .select('restaurant_id')
      .limit(1)
      .maybeSingle()
    if (!membership) return json({ error: 'No restaurant' }, 403)
    const rid = membership.restaurant_id

    const input = await req.json()
    if (!input?.zoneId || !input?.dateTime || !input?.partySize) {
      return json({ error: 'Missing required fields' }, 400)
    }

    const [tt, zn, tb, cn, ob, rv, st] = await Promise.all([
      supabase.from('table_types').select('*').eq('restaurant_id', rid),
      supabase.from('zones').select('*').eq('restaurant_id', rid),
      supabase.from('tables').select('*').eq('restaurant_id', rid),
      supabase.from('table_connections').select('*').eq('restaurant_id', rid),
      supabase.from('obstacles').select('*').eq('restaurant_id', rid),
      supabase.from('reservations').select('*').eq('restaurant_id', rid),
      supabase
        .from('restaurant_settings')
        .select('seating')
        .eq('restaurant_id', rid)
        .maybeSingle(),
    ])

    const result = await evaluateAvailability(input, {
      tableTypes: tt.data ?? [],
      zones: zn.data ?? [],
      tables: tb.data ?? [],
      connections: cn.data ?? [],
      obstacles: ob.data ?? [],
      reservations: rv.data ?? [],
      seating: st.data?.seating ?? null,
    })

    return json(result)
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Availability check failed' },
      500,
    )
  }
})
