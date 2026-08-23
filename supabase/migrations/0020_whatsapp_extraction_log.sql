-- ---------------------------------------------------------------------------
-- WhatsApp extraction log (Phase 12 stretch — AI preparation)
--
-- Every LLM extraction turn, logged: the transcript as of that turn, and the
-- draft immediately before/after. This is the audit trail the Phase 12 plan
-- doc called out as a stretch goal ("gives you an audit trail and, later, a
-- way to measure the bot's accuracy against what a host would have done") —
-- the WhatsApp-channel counterpart to `seating_decisions` (0013): a labelled
-- dataset with no live model consuming it yet, but which a future eval script
-- (or a learned extraction model) can read from.
--
-- SERVICE-ROLE ONLY, same reasoning as 0017: the webhook has no user session,
-- so RLS is enabled with no policies — only the whatsapp-webhook function
-- (service_role) ever reads or writes this table.
-- ---------------------------------------------------------------------------
create table whatsapp_extraction_log (
  id              text primary key default gen_random_uuid()::text,
  restaurant_id   text not null references restaurants (id) on delete cascade,
  conversation_id text not null references whatsapp_conversations (id) on delete cascade,
  -- The transcript as of this extraction (oldest first) — same shape as
  -- ConversationState.transcript.
  transcript      jsonb not null,
  -- The draft immediately before and after this extraction call, so a diff
  -- shows exactly what the model added/changed on this turn.
  draft_before    jsonb not null,
  draft_after     jsonb not null,
  created_at      timestamptz not null default now()
);
create index whatsapp_extraction_log_conversation_idx
  on whatsapp_extraction_log (conversation_id, created_at);
create index whatsapp_extraction_log_restaurant_idx
  on whatsapp_extraction_log (restaurant_id, created_at desc);

alter table whatsapp_extraction_log enable row level security;
-- No policies: service_role only (see header).
