This README is intentionally written like an AGENTS.md: it gives future contributors and AI coding agents rich context on how the project started, how it reached its current architecture, and a concrete, staged plan to finish it into a polished, scalable online multiplayer experience with AI opponents, in‑game chat, and an optional rewards/wagering extension. It also outlines the NYC edition follow‑up.

If you are an agent: follow the conventions and stepwise plan in this document before making large changes. Keep changes small, focused, and reversible.


**Table of Contents**
- Project Beginnings
- Where We Are Now
- Vision: Where We’re Going
- End‑to‑End Plan (Phases & Milestones)
- Detailed Workstreams (Specs & Checklists)
- Data Model Plan (D1)
- API Surface (Current and Planned)
- Game Rules Completeness Map
- Realtime & Fairness
- AI Opponents Strategy
- Chat & Safety
- Rewards/Wagering Considerations
- NYC Edition
- Local Dev, Deploy, and Ops
- Coding Conventions for Agents


**Project Beginnings**
- Origin: Modern remake of classic Monopoly for the browser. An older, monolithic client implementation existed; this repo rebuilds it as a Cloudflare Workers app with a server‑authoritative game loop.
- Early architectural choices (September 2025):
  - Move game state to Durable Objects (DO) for per‑game consistency and real‑time fan‑out via WebSockets. See `src/game.ts` (class `Game`).
  - Keep rendering/UI as simple static assets in `public/` served by the Worker’s `assets` binding. Legacy client scaffolding is trimmed; new ES modules live under `public/js/`.
  - Introduce a local development WebSocket helper (`server/local-ws/index.js`) to mirror DO protocol during local runs.
  - Add image delivery route `/img/*` backed by `IMAGES` binding with resize/format presets for tokens, dice, tiles (configured in `wrangler.jsonc`).
  - Simple demo auth using signed cookie `SESSION` (see `src/auth.ts`); initial D1 schemas added for `users`, `sessions`, `games`, and a lobby pair `lobby_rooms`, `lobby_members` (`db/schema/*.sql`).
  - Workers AI binding introduced to prototype AI opponents and utility endpoints (`/api/ai/*`) with an allowlist in `wrangler.jsonc`.


**Where We Are Now**
- Worker entry: `src/index.ts` routes API, DO traffic, images, auth, and AI helper endpoints.
- DO game loop: `src/game.ts` holds authoritative state, manages sockets, joins, dice, movement, and basic effects. Board, Chance, and Community Chest data live in `src/board.ts`. Shared types in `src/types.ts`.
- Lobby (MVP): `/lobby.html` + `/api/lobby/*` endpoints scaffold room creation/list/join.
- D1 schemas present for core and lobby; migrations are file‑driven via npm scripts in `package.json`.
- Images, assets, DO, AI, D1 bindings configured in `wrangler.jsonc`. A default AI model is set (adjust via secrets/config before production).
- Local WS helper mirrors the Worker protocol for quicker iteration.


**Vision: Where We’re Going**
- A polished, server‑authoritative, online multiplayer Monopoly with:
  - 2–8 players per room, hot‑join/reconnect, spectators.
  - Full parity with the classic board game rules: properties, auctions, trades, houses/hotels, mortgages, utilities/railroads math, jail and doubles, Chance/Community Chest effects, bankruptcy, and end‑of‑game conditions.
  - AI opponents of adjustable difficulty, grounded in game state with explainable suggestions.
  - In‑game text chat per session with basic moderation and presence.
  - Optional rewards (credits) and wagering extension with payouts; designed to be modular and compliant by default (e.g., virtual credits / sweepstakes‑style), with real‑money integration gated by jurisdictional checks and external services.
  - Themed editions, starting with the NYC edition (board skins, card text, imagery) after the classic game is complete and stable.


**End‑to‑End Plan (Phases & Milestones)**
1) Core Rules Completion
- Implement full rules parity, auctions, trades, building/selling, mortgages/unmortgage, bankruptcy, endgame.
- Deterministic dice and fairness controls (server RNG + optional commit‑reveal). Comprehensive tests.

2) Realtime & Persistence
- Robust DO session management, reconnection, heartbeats, spectator mode. Snapshot and event log to D1. Recent games endpoint.

3) Lobby & Matchmaking
- Room lifecycle (open/playing/finished), invites, privacy flags, rate limiting, presence. Persist to `monopolyui`.

4) Accounts & AuthN/Z
- Email/username login, password hashing, sessions, basic profile, online indicator. Optional SSO via Cloudflare Access headers.

5) Chat & Safety
- Per‑game WS chat channel, typing indicators, history in DO with optional spillover to D1. Basic moderation and filters.

6) AI Opponents
- Strategy engine with pluggable policy: rule‑based baseline + model‑guided suggestions via Workers AI. Difficulty tiers. Tooling for evaluation.

7) Rewards/Wagering (Modular)
- Virtual credits economy first. Bets per game with escrow, payout rules, anti‑abuse, audit trail. Compliance gates for any real‑money variant.

8) Theming & NYC Edition
- Skinning system for board/tiles/cards/images. NYC edition as a content pack, toggle at room creation.

9) Observability & Ops
- Logging, tracing, metrics, error budgets, synthetic tests, chaos drills. Admin tools for room/game introspection.

10) Polish & Launch
- Performance passes, accessibility, mobile layout, onboarding, tutorials, final QA, load tests, and staged rollout.


**Detailed Workstreams (Specs & Checklists)**

- Rules Engine
  - Server‑authoritative state machine in `Game` DO; all client intents validate on server.
  - Actions: `rollDice`, `endTurn`, `buy`, `auction`, `bid`, `trade:init/accept/counter`, `build`, `sell`, `mortgage`, `unmortgage`, `pay`, `bankrupt`.
  - Auctions: on decline to buy; timed rounds; highest bidder wins; funds escrowed then settled.
  - Trades: offer builder (cash, properties, cards), validation, acceptance.
  - Jail: roll doubles, pay, or use card; track turns.
  - Utilities/Railroads: dynamic rent formulas; test coverage.
  - Bankruptcy: asset liquidation, transfer to creditor or bank, player elimination.
  - Chance/Community Chest: full deck definitions with shuffles; idempotent effects; tests.

- Realtime & Persistence
  - WebSocket protocol messages: `WELCOME`, `STATE`, `PATCH`, `CHAT`, `ERROR`, heartbeats.
  - Reconnect by `user` token; map sockets to player id; spectator flag.
  - Persist snapshots to D1 on important transitions; recent games listing.
  - Rate limits & spam protection at DO boundary.

- Lobby/Rooms
  - Create/list/join endpoints finalized; room statuses `open|playing|finished`.
  - Invite links, max players, private rooms, spectate toggle.

- Auth & Accounts
  - Password hashing (`src/auth.ts` hooks), sessions with expiry/refresh; CSRF for non‑idempotent HTTP.
  - Optional Access header mapping (Google SSO via Cloudflare Access).

- Chat & Safety
  - Text channel per game in DO; basic profanity/abuse filter; flood control.
  - Optional content moderation model via Workers AI. Message size limits.

- AI Opponents
  - Policy core: evaluate buy/build/mortgage/trade utility; risk and liquidity constraints.
  - Model‑guided suggestions endpoint (`/api/ai/suggest-move`) already scaffolded. Wrap with parser and guardrails.
  - Difficulty tiers: Easy (randomized heuristics), Medium (heuristics + model nudge), Hard (search + model scoring).
  - Determinism toggle for tests; seedable randomness.

- Rewards/Wagering (Virtual Credits First)
  - Credits in `users.credits`; per‑game `bets` table; `payouts` ledger; balance checks.
  - Game escrow at start; settlement at end; disputes triage; audit trail.
  - Compliance gates: feature flag; real‑money requires KYC, age checks, geofencing; separate provider integration.

- NYC Edition
  - Theme pack: board tiles, property names/colors, chance/chest card text, imagery under `public/images/nyc/`.
  - Configurable presets per room; no rules changes.

- Observability & Ops
  - Structured logs; per‑message diagnostics behind debug flag.
  - Health endpoints; synthetic lobbies/games. SLOs and alerts.


**Data Model Plan (D1)**
- Existing tables: `users`, `sessions`, `games`, `lobby_rooms`, `lobby_members`.
- Planned additions:
  - `game_snapshots(id, game_id, turn, state_json, created_at)`
  - `game_events(id, game_id, seq, type, payload_json, created_at)`
  - `bets(game_id, user_id, amount, status, created_at)`
  - `payouts(id, game_id, user_id, amount, reason, created_at)`
  - Indices on `game_id`, `created_at`; quotas and retention jobs.


**API Surface (Current and Planned)**
- Current
  - Game DO: `/api/game/:id/websocket` (WS), `/api/game/:id` (GET state)
  - Auth: `/auth/login`, `/auth/logout`, `/auth/whoami`, `/auth/signup`, `/auth/login-email`
  - Lobby: `/api/lobby/list`, `/api/lobby/create`, `/api/lobby/join`, `/api/lobby/heartbeat`
  - AI: `/api/ai/*` helpers (models, chat, suggest-move, embeddings, i2t, tts, asr, translate, classify)
  - Images: `/img/*` presets and format negotiation
- Planned
  - Trades: `/api/game/:id/trade/*` (HTTP intents funneled to DO or pure WS)
  - Spectate: `/api/lobby/spectate` toggle
  - Recent games: `/api/games/recent` (already scaffolded)


**Game Rules Completeness Map**
- Implemented: joins, rolls, movement, pass‑GO bonus, basic taxes, buying hints, rent payments, go‑to‑jail basics.
- To complete: auctions, trades, hotels, mortgages, unmortgage, sell buildings, full jail rules, card effects audit, bankruptcy rules, end‑of‑game, banker bank funds.
- Testing: add scenario tests for every square, every card, and multi‑turn flows.


**Realtime & Fairness**
- Dice RNG: use `crypto.getRandomValues` on the server; include roll transcript in the event log.
- Optional commit‑reveal: server commits to roll seed before turn; reveals after, to support auditability.
- Anti‑cheat: all state transitions validated server‑side; clients send intents only.


**AI Opponents Strategy**
- Pipeline: extract features from `GameState` → heuristic evaluator → optional model call (Workers AI) → action with reason.
- Safety: constrain outputs to allowed action set; time budgets per decision; deterministic test mode.
- Training data (future): anonymized event logs to self‑play or offline policy improvement.


**Chat & Safety**
- WS message types: `CHAT:send`, `CHAT:broadcast`, `CHAT:history`.
- Moderation: simple blocklist and rate limiter; optional AI moderation; kick/ban by room owner.


**Rewards/Wagering Considerations**
- Default build should be virtual credits only and region‑agnostic.
- Real‑money features MUST be feature‑flagged, disabled by default, and gated behind jurisdictional checks (KYC/age/geofence). Consult legal before enabling.
- Payouts must be idempotent with durable records and dispute handling.


**NYC Edition**
- Deliver as a theme pack (no logic changes):
  - Board skin, tile names, imagery, card text variants.
  - Configurable via room `theme` value; assets under `public/images/nyc/` and CSS tokens.


**Local Dev, Deploy, and Ops**
- Prereqs: Node 22+, Wrangler 4.35+ (`npx wrangler --version`).
- Local D1: `npm run db:reset:local` to create fresh local sqlite; or `npm run db:setup:local`.
- Dev server: `npm run preview` (local worker) or `npm run dev` (wrangler dev). For local WS helper: `npm run dev:all`.
- Deploy: `npm run deploy`. DO migrations managed by `wrangler.jsonc`.
- Secrets: set `AUTH_SECRET` via `wrangler secret put AUTH_SECRET`; do not keep real secrets in config.


**Coding Conventions for Agents**
- Keep server authoritative: never trust client state; accept intents only.
- Small PRs: one feature or fix at a time; update this README plan if scope changes.
- Tests before refactors; prefer deterministic helpers for dice/AI in tests.
- Follow file structure and naming already present; avoid unnecessary churn.
- Document new endpoints and schema changes; add minimal inline comments only where logic is non‑obvious.


That’s the roadmap. Before starting new work, pick the next milestone from “End‑to‑End Plan”, implement surgically, and update the relevant checklist above.
You should not ask me questions until the task is completed.