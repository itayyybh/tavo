# Restaurant Floor Manager

## What this is

A **Restaurant Floor Management Platform** — **not** a reservation system. Its purpose is to help the host manage the restaurant floor as efficiently as possible: guest seating, table allocation, occupancy, waiting lists, table merging/splitting, reservation flow, and (eventually) AI-powered seating decisions.

Quality bar: a premium SaaS product comparable to Linear, Stripe, and Notion.

**North star:** every feature must help the host seat guests faster, maximize occupancy, and manage the floor with minimal effort — while delivering a premium experience.

## Core product surfaces

- **Layout Editor** — Figma-like restaurant builder: grid, snap, drag, zoom, pan, rotate, resize, multi-select, undo/redo, auto-save, layout versioning. See the `layout-editor` skill.
- **Live Floor** — top-down real-time view. Table states: Available, Reserved, Occupied, Cleaning, Blocked. Smooth animations, minimal B&W design.
- **Zones** — unlimited zones (Inside, Outside, Smoking, Non-Smoking, VIP, Bar…). Each zone contains tables, a waiting list, and reservations.
- **Table System** — configurable table types with distinct **solo** and **connected** capacities; merge & split (merged tables act as one logical table). Never hardcode capacities.
- **Reservations** — name, phone, guests, time, expected duration, preferred zone, notes, accessibility, baby chair, smoking preference. CRUD + timeline + filter/search/sort.
- **Seating Engine** — given a reservation, suggest the optimal table considering capacity, current occupancy, future reservations, merge possibilities, zone preference, and restaurant rules. Built to become AI-assisted (abstracted, logged, decision-history-driven).

## How to work in this repo

Skills in `.claude/skills/` are the enforceable rules — they auto-apply by topic. Key ones:

- `ai-rules` — architecture-first workflow (validate approach before coding)
- `react-architecture`, `code-quality`, `folder-structure` — how code is structured
- `state-managment` — Zustand, separate stores
- `data-model` — everything configurable, never hardcode restaurant logic
- `ui-design`, `animation` — premium minimal B&W look, Framer Motion motion
- `performance` — render/list/canvas optimization
- `layout-editor` — the Figma-like editor rules
- `git` — small, single-feature commits

Working principles: never rush; prioritize architecture over speed; production-quality code; think like a senior engineer, senior product designer, and startup CTO; challenge assumptions when a better architecture exists; keep the codebase simple, scalable, and maintainable.

## Roadmap

1. **Foundation** — React + TS + Tailwind + Zustand + Framer Motion + ESLint/Prettier + routing + folder architecture
2. **Design System** — typography, buttons, inputs, cards, panels, dialogs, badges, table-status colors, spacing, light/dark foundations
3. **Layout Editor** — grid/snap/drag/zoom/pan, create/move/rotate/delete tables, save/load
4. **Zone Management** — create/rename/delete zones, assign tables, visual boundaries
5. **Table System** — types, capacities, merge/split rules, custom properties
6. **Reservation System** — CRUD, validation, timeline, filter/search/sort
7. **Seating Engine (MVP)** — one-click optimal table suggestion
8. **Live Floor** — real-time status + animations
9. **Host Experience** — quick actions, keyboard shortcuts, minimal-click flows
10. **Data Persistence** — DB, auth, restaurant profiles, layout/reservation persistence (multi-restaurant)
11. **AI Preparation** — abstract engine, logging, decision history, prediction-ready architecture
12. **Future** — camera-based layout generation, AI seating optimization, analytics, heat maps, occupancy/revenue prediction, POS & booking integrations, SMS/WhatsApp, multi-floor
