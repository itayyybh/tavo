-- ---------------------------------------------------------------------------
-- WhatsApp reservation channel (Phase 12)
--
-- WhatsApp is a new reservation SOURCE, not a new engine: an inbound message
-- terminates at the same place a manual host entry does — a row in
-- `reservations` with `source = 'whatsapp'`. These two tables are the only new
-- persistence the channel needs.
--
-- SERVICE-ROLE ONLY. Unlike every other tenant table, these are never touched
-- by a logged-in user: an inbound Meta webhook has no auth session. Tenancy is
-- resolved from WHICH business number the message arrived on (whatsapp_channels)
-- rather than from a membership. So RLS is ENABLED with NO policies — that
-- blocks anon/authenticated entirely while the service_role key (used by the
-- `whatsapp-webhook` edge function) bypasses RLS. No client ever reads these.
-- ---------------------------------------------------------------------------

-- whatsapp_channels — the trust anchor. Maps a Meta WhatsApp Business
-- `phone_number_id` to the restaurant that owns that number. This is what
-- replaces membership-derived tenancy for the webhook.
create table whatsapp_channels (
  id              text primary key default gen_random_uuid()::text,
  restaurant_id   text not null references restaurants (id) on delete cascade,
  -- Meta's stable id for the business phone number (not the display number).
  phone_number_id text not null unique,
  -- Human-readable number for the dashboard; advisory only.
  display_phone   text,
  created_at      timestamptz not null default now()
);
create index whatsapp_channels_restaurant_idx
  on whatsapp_channels (restaurant_id);

alter table whatsapp_channels enable row level security;
-- No policies: service_role only (see header).

-- whatsapp_conversations — per-guest booking state across the multi-turn flow.
-- Each inbound message is a separate stateless webhook call, so "what we know
-- so far" (the ReservationDraft in progress + the transcript) has to be
-- persisted between messages. `state` is JSONB so the draft/transcript shape can
-- evolve without a migration.
--
--   state = { "draft": { ...partial ReservationDraft }, "transcript": [ ... ] }
create table whatsapp_conversations (
  id              text primary key default gen_random_uuid()::text,
  restaurant_id   text not null references restaurants (id) on delete cascade,
  guest_phone     text not null,
  state           jsonb not null default '{}'::jsonb,
  status          text not null default 'collecting'
    check (status in ('collecting', 'confirmed', 'abandoned')),
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index whatsapp_conversations_restaurant_idx
  on whatsapp_conversations (restaurant_id, last_message_at desc);

-- At most one LIVE conversation per (channel's restaurant, guest). Terminal
-- rows (confirmed/abandoned) are kept as history and don't block a fresh one,
-- so the webhook's load-or-create can't race two open threads for one guest.
create unique index whatsapp_conversations_active_uniq
  on whatsapp_conversations (restaurant_id, guest_phone)
  where status = 'collecting';

alter table whatsapp_conversations enable row level security;
-- No policies: service_role only (see header).
