// Extraction logging for the WhatsApp channel (Phase 12 stretch — AI prep).
//
// Logs every LLM extraction turn: the transcript as of that turn, and the
// draft immediately before/after. This is the audit trail the Phase 12 plan
// doc flagged as a stretch goal — the WhatsApp-channel counterpart to
// `seating_decisions` (Phase 11): a labelled dataset with no live model
// consuming it yet, but which a future eval script (or a learned extraction
// model) can read from to measure — and eventually improve — extraction
// accuracy.
//
// Logging failures must never break a guest's conversation — a webhook that
// 500s because a log insert failed would be strictly worse than not logging
// at all. So this insert is fire-and-forget: errors are caught and reported
// to console, never thrown.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { DraftFields, TranscriptEntry } from './_store.ts'

export interface ExtractionLogEntry {
  restaurantId: string
  conversationId: string
  transcript: TranscriptEntry[]
  draftBefore: DraftFields
  draftAfter: DraftFields
}

/** Record one extraction turn. Never throws — see header. */
export async function logExtraction(
  supabase: SupabaseClient,
  entry: ExtractionLogEntry,
): Promise<void> {
  const { error } = await supabase.from('whatsapp_extraction_log').insert({
    restaurant_id: entry.restaurantId,
    conversation_id: entry.conversationId,
    transcript: entry.transcript,
    draft_before: entry.draftBefore,
    draft_after: entry.draftAfter,
  })
  if (error) {
    console.error('[whatsapp] extraction log insert failed', error)
  }
}
