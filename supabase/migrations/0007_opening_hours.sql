-- Phase 11 — Settings shell: weekly opening hours. A single jsonb column on the
-- existing per-restaurant settings row (member-scoped RLS already applies, and
-- the app upserts the whole row — no new policy or RPC needed).
--
-- Seven entries indexed by weekday (0 = Sunday … 6 = Saturday), each
-- { open: bool, from: "HH:mm", to: "HH:mm", lastSeating: "HH:mm" | null }. The
-- default mirrors DEFAULT_OPENING_HOURS in the app so existing rows and new
-- inserts start open every day (Sun–Fri 08:30, Sat 11:00, closing 23:00).

alter table restaurant_settings
  add column if not exists opening_hours jsonb not null default '[
    {"open": true, "from": "08:30", "to": "23:00", "lastSeating": null},
    {"open": true, "from": "08:30", "to": "23:00", "lastSeating": null},
    {"open": true, "from": "08:30", "to": "23:00", "lastSeating": null},
    {"open": true, "from": "08:30", "to": "23:00", "lastSeating": null},
    {"open": true, "from": "08:30", "to": "23:00", "lastSeating": null},
    {"open": true, "from": "08:30", "to": "23:00", "lastSeating": null},
    {"open": true, "from": "11:00", "to": "23:00", "lastSeating": null}
  ]'::jsonb;
