import { createClient } from '@supabase/supabase-js'

/**
 * The single Supabase client for the app (Phase 9).
 *
 * `persistSession` + `autoRefreshToken` (both on by default, pinned here for
 * clarity) satisfy the "stay authenticated after refresh / on another device"
 * requirement — the session lives in localStorage and refreshes itself.
 *
 * Credentials come from Vite env vars (`.env`, gitignored). The anon key is safe
 * to ship to the browser; tenant isolation is enforced by Row-Level Security in
 * the database, never by hiding the key.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Fail loud in dev — a missing env var otherwise surfaces as opaque 401s.
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env and fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
