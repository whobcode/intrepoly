# Commands: Setup, Schema, Migrations, Deploy

This project is a single Cloudflare Worker that serves the UI, the API, and a Durable Object (DO) for live WebSockets. It also uses two D1 databases:
- `monopolyd1` — core: users, sessions, games snapshots/stats
- `monopolyui` — lobby: rooms and members

Follow these steps in order (replace values as needed).

## 0) Prereqs
- Node 20+ and `npm i -g wrangler` (or use `npx wrangler`)
- `wrangler login`

## 1) Create D1 databases (if you don’t already have them)
If you already created these and put their IDs in `wrangler.jsonc`, you can skip this step.

```bash
# Core DB (users/games)
wrangler d1 create monopolyd1
# UI DB (lobby)
wrangler d1 create monopolyui

# List databases to copy their IDs
wrangler d1 list
```

Update `wrangler.jsonc` → `d1_databases` with the returned `database_id` values.

## 2) Verify wrangler.jsonc bindings
Ensure these sections exist (names must match exactly):
- `images.binding = IMAGES`
- `assets.binding = ASSETS` and `assets.run_worker_first = ["/api/*", "/img/*"]`
- `durable_objects.bindings[0].name = GAME` and `class_name = Game`
- `d1_databases` includes `monopolyd1`, `monopolyui` (and optional local `DB`)
- `vars.AUTH_SECRET` set via secret (see next step)

## 3) Set secrets
```bash
wrangler secret put AUTH_SECRET
# Paste a strong random string (32+ chars)
```

## 4) (Optional but recommended) Pre‑create D1 schema
The app lazily creates the tables on first use, but you can pre‑apply schema with these commands (one statement per exec to avoid multi‑statement parse issues):

Core schema (monopolyd1):
```bash
wrangler d1 execute monopolyd1 --command "CREATE TABLE IF NOT EXISTS users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  email TEXT UNIQUE,\n  username TEXT UNIQUE,\n  password_hash TEXT,\n  wins INTEGER DEFAULT 0,\n  losses INTEGER DEFAULT 0,\n  credits INTEGER DEFAULT 0,\n  wallet_amount INTEGER DEFAULT 0,\n  wallet_id TEXT,\n  online INTEGER DEFAULT 0,\n  gamer_id TEXT UNIQUE,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now'))\n)"

wrangler d1 execute monopolyd1 --command "CREATE TABLE IF NOT EXISTS sessions (\n  id TEXT PRIMARY KEY,\n  user_id INTEGER NOT NULL,\n  created_at TEXT DEFAULT (datetime('now')),\n  expires_at TEXT,\n  FOREIGN KEY(user_id) REFERENCES users(id)\n)"

wrangler d1 execute monopolyd1 --command "CREATE TABLE IF NOT EXISTS games (\n  id TEXT PRIMARY KEY,\n  owner_user_id INTEGER,\n  state_json TEXT,\n  status TEXT DEFAULT 'open',\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  FOREIGN KEY(owner_user_id) REFERENCES users(id)\n)"
```

Lobby schema (monopolyui):
```bash
wrangler d1 execute monopolyui --command "CREATE TABLE IF NOT EXISTS lobby_rooms (\n  id TEXT PRIMARY KEY,\n  owner_user TEXT,\n  status TEXT DEFAULT 'open',\n  created_at TEXT DEFAULT (datetime('now'))\n)"

wrangler d1 execute monopolyui --command "CREATE TABLE IF NOT EXISTS lobby_members (\n  room_id TEXT,\n  user TEXT,\n  joined_at TEXT DEFAULT (datetime('now')),\n  PRIMARY KEY (room_id, user)\n)"
```

Or run from files (simplest):
```bash
npm run db:setup   # applies db/schema/core.sql and db/schema/ui.sql
# or individually
npm run db:core
npm run db:ui
 
# Remote (production) apply
npm run rdb:setup  # runs --remote against monopolyd1 and monopolyui
```

## 5) DO migration + deploy
Durable Object classes are registered via the `migrations` block in `wrangler.jsonc`. Deploy will apply it automatically.

```bash
# Local dev
npm run dev   # or: npx wrangler dev

# Deploy (applies DO migration if needed)
npm run deploy  # or: npx wrangler deploy
```

## 6) Test live online play
- Create a room: open `/lobby.html` → “Create Room”
- Share link: use “Copy Link” per room row
- Spectate: open `/?spectate=1#<room-id>`
- Join and play: open `/#<room-id>` and click Start Game

## 7) (Optional) Cloudflare Access (Google SSO)
If you enable Access in front of the Worker, the app will auto‑provision users from the `Cf-Access-Authenticated-User-Email` header. Configure your Access policy in the Cloudflare dashboard.

## Notes
- You can also serve the static UI from Cloudflare Pages and call this Worker for the API; current setup serves everything from this Worker.
- `/img/*` uses the `IMAGES` binding for format/resize and caches at the edge.
- Durable Object keeps each game’s state and WebSocket fan‑out; D1 stores users, lobby, and snapshots.
