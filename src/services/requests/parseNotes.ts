import { supabase } from '@/services/supabase/client'
import type { ParsedRequest } from '@/types'

/**
 * Client caller for the AI notes parser (edge function `parse-request`).
 *
 * Sends the free-text notes; the server reads the caller's floor (tables +
 * shapes), asks the model to extract explicit seating requests, and validates
 * the result against the real layout before returning it. Kept behind one async
 * function so the model/provider can change without touching callers.
 *
 * Best-effort: a null return means "no request" — an empty result, an
 * undeployed function, or an offline client. Parsing must never block saving a
 * reservation, so callers treat failure as simply "no parsed request".
 */
export async function parseNotes(notes: string): Promise<ParsedRequest | null> {
  const text = notes.trim()
  if (!text) return null
  try {
    const { data, error } = await supabase.functions.invoke('parse-request', {
      body: { notes: text },
    })
    if (error) throw error
    const result = data as ParsedRequest | null
    // Treat an all-empty result as no request so callers don't store noise.
    if (!result || (result.tableLabels.length === 0 && !result.shape)) return null
    return result
  } catch (err) {
    console.warn('Notes parsing unavailable — skipping request detection.', err)
    return null
  }
}
