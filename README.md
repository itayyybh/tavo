# Tavo

**A restaurant floor-management platform — not a reservation system.**

Tavo helps a host run the floor: seat guests faster, keep occupancy high, and manage tables, zones, and reservations with minimal effort. It grew out of a real problem at a real restaurant — phone-only reservations with no seating logic behind them — and is now piloted in production on live Friday-night service.

**Live demo:** [restaurant-floor-manager.vercel.app](https://restaurant-floor-manager.vercel.app)

---

## What it does

- **Layout Editor** — a Figma-style floor builder: grid, snap, drag, zoom, pan, rotate, resize, multi-select, undo/redo, and layout versioning. Build your actual floor plan, not a generic template.
- **Live Floor** — a real-time top-down view of the restaurant. Tables move through Available → Reserved → Occupied → Cleaning → Blocked with smooth, minimal animations.
- **Zones** — unlimited zones (Inside, Outside, Bar, VIP, Smoking, whatever the restaurant actually has), each with its own tables, waiting list, and reservations.
- **Table System** — configurable table types with separate solo/connected capacities, plus table merging and splitting. Nothing about restaurant layout is hardcoded.
- **Reservations** — full CRUD with name, party size, time, expected duration, zone preference, and notes, plus a timeline view and filter/search/sort.
- **Seating Engine** — given a reservation, recommends the best table by weighing capacity, current and upcoming occupancy, merge options, zone preference, and configurable restaurant rules. Every recommendation is logged against what actually happened, so the system has real outcome data to learn from.
- **WhatsApp integration** — reservations can flow in through WhatsApp via a serverless webhook that calls the same seating engine.

## Why it exists

Most restaurants without an enterprise POS/reservation system run seating entirely on the host's memory and a paper note. Tavo started as an attempt to fix that at one specific restaurant (Cafe Jolie), and is now used there for real service: the floor is pre-arranged from phone reservations before the shift starts, instead of being worked out table-by-table on paper as guests walk in.

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19, TypeScript, Tailwind CSS |
| State | Zustand |
| Canvas / layout editor | Konva (react-konva) |
| Motion | Framer Motion |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Edge Functions) |
| i18n | i18next / react-i18next |
| Routing | React Router |
| Build | Vite, esbuild (for bundling Edge Functions) |
| Tooling | ESLint, Prettier, Vitest |

## Getting started

```bash
git clone https://github.com/itayyybh/tavo.git
cd tavo
npm install
```

Create a Supabase project, then copy the example env file and fill it in from your project's *Settings → API*:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

The anon key is browser-safe — tenant isolation is enforced by database Row Level Security. The `service_role` key is never used client-side; it's only set as an Edge Function secret.

Run it:

```bash
npm run dev
```

Other useful scripts:

```bash
npm run build              # type-check + production build
npm run test                # run tests once
npm run test:watch          # watch mode
npm run lint                # eslint
npm run format               # prettier --write

npm run build:edge           # bundle the seating engine into supabase/functions/check-availability
npm run build:edge:whatsapp  # bundle the seating engine + reservation parser for the WhatsApp webhook
```

## How the seating engine works

The recommendation logic (`src/services/seating/`) is a rules-based engine, not a black box:

1. **Hard constraints** filter out invalid tables — capacity, zone rules, conflicting reservations, table status, merge rules.
2. **Soft scoring** ranks the remaining candidates — minimizing wasted seats, respecting zone preference, and accounting for reservation duration.
3. Every recommendation and its eventual outcome (seated as suggested, overridden, no-show, etc.) is logged, building a real dataset of what actually works on the floor — not just what the engine predicted.

The same engine runs both inside the app and as a standalone Supabase Edge Function, so it can be called from external channels (like the WhatsApp webhook) without duplicating the logic.

## Project structure

```
src/
  services/
    seating/        # the seating engine: candidates, scoring, merge rules, optimization
    whatsapp/        # WhatsApp reservation parsing
  ...                # components, stores, routes
supabase/
  functions/          # Edge Functions (check-availability, whatsapp-webhook)
  migrations/         # database schema, incl. seating decision/outcome logging
docs/                 # setup notes for specific integrations (e.g. WhatsApp)
```

## Status

Tavo is an active, real-world project — not a demo. It's currently piloted at Cafe Jolie in Tel Aviv, replacing a manual paper-based seating process on real service. Development is ongoing; expect the API and schema to keep evolving as the pilot expands.

Built with architecture-first, AI-assisted development (Claude directed the implementation; the product decisions, research, and validation are mine).

## License

MIT — see [LICENSE](./LICENSE).
