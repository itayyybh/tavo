# Phase 12 — WhatsApp Reservation Agent: Setup & Test Plan

How to deploy the WhatsApp booking channel and exercise it end-to-end. The
architecture is in `phase-12-whatsapp-reservations.md`; this is the operational
companion.

The transport is behind a `WhatsAppProvider` seam, so there are two modes:

- **mock** (default) — local dev/testing with no Meta account (curl / the chat
  client). `WHATSAPP_PROVIDER=mock`.
- **meta** — real WhatsApp via Meta Cloud API. `WHATSAPP_PROVIDER=meta`.

Nothing in the reservation / LLM / business logic differs between them.

---

## 1. Prerequisites

- Migration `0017_whatsapp.sql` applied (creates `whatsapp_channels`,
  `whatsapp_conversations`).
- `ANTHROPIC_API_KEY` available (shared with `parse-request`) — the extraction
  step needs it in both modes.

---

## 2. Environment variables

Set as **Supabase Edge Function secrets** in production; in a local
`supabase/functions/.env` for `functions serve` / `deno run`.

| Variable | Mode | Purpose |
|---|---|---|
| `SUPABASE_URL` | both | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | both | Service-role key — the webhook has no user session; bypasses RLS to read the service-role-only `whatsapp_*` tables |
| `ANTHROPIC_API_KEY` | both | LLM extraction (Claude) |
| `WHATSAPP_PROVIDER` | both | `mock` (default) or `meta` |
| `WHATSAPP_CONVO_TIMEOUT_MIN` | both | Inactivity timeout before a `collecting` conversation is retired as `abandoned` (default `45`) |
| `WHATSAPP_VERIFY_TOKEN` | both | Token echoed during the GET webhook handshake (you invent it) |
| `WHATSAPP_APP_SECRET` | meta | Meta **App Secret** — verifies the `X-Hub-Signature-256` HMAC on inbound POSTs |
| `WHATSAPP_ACCESS_TOKEN` | meta | Graph API bearer token for sending replies |
| `WHATSAPP_PHONE_NUMBER_ID` | meta | The business number's id — the send-endpoint path |
| `WHATSAPP_GRAPH_VERSION` | meta (opt) | Graph API version, default `v21.0` |
| `WHATSAPP_MOCK_SECRET` | mock (opt) | If set, the mock requires a matching `x-mock-signature` header (to test signature rejection) |

> **Security:** `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_APP_SECRET`, and
> `WHATSAPP_ACCESS_TOKEN` are full-access credentials. Keep them only in secrets /
> the gitignored `.env`. Never commit them, never expose them to the client.

---

## 3. Deploy

```bash
# 1. Apply the migration (or paste 0017_whatsapp.sql in the SQL editor).
supabase db push

# 2. Rebuild the bundled engine + validation (checked in, but refresh on change).
npm run build:edge:whatsapp

# 3. Set secrets (production).
supabase secrets set \
  WHATSAPP_PROVIDER=meta \
  WHATSAPP_VERIFY_TOKEN=<your-verify-token> \
  WHATSAPP_APP_SECRET=<meta-app-secret> \
  WHATSAPP_ACCESS_TOKEN=<graph-access-token> \
  WHATSAPP_PHONE_NUMBER_ID=<phone-number-id> \
  ANTHROPIC_API_KEY=sk-ant-... \
  --project-ref <ref>
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

# 4. Deploy the function. --no-verify-jwt: inbound webhooks carry no Supabase
#    JWT; the function does its own auth (signature + channel lookup).
supabase functions deploy whatsapp-webhook --no-verify-jwt --project-ref <ref>
```

The function URL is:
`https://<ref>.supabase.co/functions/v1/whatsapp-webhook`

---

## 4. Meta Business setup (done in Meta's dashboard — manual)

1. **Meta app** — [developers.facebook.com](https://developers.facebook.com) →
   create an app → add the **WhatsApp** product.
2. **Cloud API number** — under WhatsApp → API Setup, note the **Phone number
   ID** (`WHATSAPP_PHONE_NUMBER_ID`) and generate/collect the **access token**
   (`WHATSAPP_ACCESS_TOKEN`). For production use a permanent System User token.
3. **App Secret** — App settings → Basic → **App Secret**
   (`WHATSAPP_APP_SECRET`).
4. **Webhook** — WhatsApp → Configuration → Edit webhook:
   - Callback URL: the function URL above.
   - Verify token: your `WHATSAPP_VERIFY_TOKEN`.
   - Meta sends a GET handshake; the function echoes `hub.challenge` → verified.
   - Subscribe to the **messages** field.
5. **Map the number to a restaurant** — one row per business number (SQL editor):
   ```sql
   insert into whatsapp_channels (restaurant_id, phone_number_id, display_phone)
   values ('<restaurant-id>', '<phone-number-id>', '+15551234567');
   ```
   This is the tenancy anchor: a message on that number resolves to this
   restaurant.

---

## 5. Local testing (mock mode — no Meta account)

```bash
# Map a fake number to your restaurant (once):
#   insert into whatsapp_channels (restaurant_id, phone_number_id)
#   values ('<restaurant-id>', 'test-1');

# Serve (Docker) — or use the deno fallback below.
supabase functions serve --no-verify-jwt --env-file=supabase/functions/.env

# deno fallback (no Docker); listens on :8000
deno run --watch --env-file=supabase/functions/.env \
  --allow-net --allow-env --allow-read \
  supabase/functions/whatsapp-webhook/index.ts

# Chat interactively (point at :8000 for the deno fallback)
FN_URL=http://localhost:8000 node scripts/wa-chat.mjs
```

In the chat: `/new` starts a fresh guest, `/quit` exits.

---

## 6. Manual test plan

Run each in mock mode locally; repeat the ★ cases against a real WhatsApp test
number before go-live. After a booking, verify the row:

```sql
select guest_name, party_size, status, source, preferred_zone_id, assigned_table_ids
from reservations where source = 'whatsapp' order by created_at desc;
```

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 ★ | **Happy path** | "table for 4 tomorrow 8pm inside, Dana" → `yes` | Confirm prompt → `received` reply. Row: `status=pending`, `source=whatsapp`, `assigned_table_ids=null`. Conversation `confirmed`. |
| 2 | **Multi-turn** | "hi" → bot asks name → party → date/time → zone, one at a time | Draft fills across turns; `state.draft` grows. |
| 3 | **Host acceptance** | After #1, open Reservations/Floor | Booking shows as **pending** with a WhatsApp badge; host accepts + assigns a table (never auto-seated). |
| 4 | **Smoking disambiguation** | "table for 2 tomorrow 8pm outside" (2 outdoor zones differing by smoking) | Bot asks "smoking or non-smoking?"; answer resolves the specific zone. |
| 5 | **Party over limit** | "table for 50 …" | "the largest party we can book is <max>" (not a generic message). |
| 6 | **After latest / closed hours** | Time past the latest booking / on a closed day | States the specific limit (latest time / closed day). |
| 7 | **Slot genuinely full** | A zone with no free table at that time | Generic "no table … another time?". |
| 8 | **Duplicate** | Same name + party ±90 min of an existing booking | Soft "already a booking …" warning; `yes` proceeds. |
| 9 ★ | **Hebrew** | Converse in Hebrew incl. `כן` to confirm | Replies in Hebrew; `כן` finalizes (ASCII `\b` bug fixed). |
| 10 | **Timeout / abandoned** | Start a booking, wait past `WHATSAPP_CONVO_TIMEOUT_MIN`, send again | Old `collecting` row → `abandoned`; a fresh conversation starts. No dangling `pending`. |
| 11 | **Unknown number** | POST with an unmapped `phoneNumberId` | Acked, no reply, log warns; nothing created. |
| 12 | **Signature reject** (meta) / set `WHATSAPP_MOCK_SECRET` (mock) | POST with a bad/absent signature | `401 Invalid signature`; nothing processed. |
| 13 ★ | **Webhook verify** | GET `…?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123` | Returns `123` (wrong token → 403). |

---

## 7. Switching mock → real WhatsApp

Set `WHATSAPP_PROVIDER=meta` plus the meta secrets (§2), redeploy. No code change
— `getProvider()` selects `MetaWhatsAppProvider`, which yields the same
normalized messages the mock did.

---

## 8. Known limits / follow-ups (not MVP)

- **Conversation timeout is lazy** — a stale `collecting` row is retired on the
  guest's *next* message, not by a background job. Add a `pg_cron` reaper if
  stale rows or a "still there?" nudge are wanted (a nudge outside the 24h
  window needs a Meta-approved template).
- **Cancel/change an existing booking** — not a conversation branch yet.
- **Language** follows the guest's message (en/he); there is no per-restaurant
  language setting in the DB.
- **Decision logging** — WhatsApp extractions aren't logged to `seating_decisions`
  yet (stretch from the plan doc).
