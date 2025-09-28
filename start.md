# Start Guide (No Containers)

This file walks you from a fresh checkout to a running local game, tunneling it to the internet, and then deploying to Cloudflare — all without using the new container setup. It expands on each step, starting with `ncu -u` as requested.

## Prerequisites
- Node.js 22 or newer (`node -v`).
- npm 10+ (comes with Node 22).
- Wrangler 4.35+ (installed via `npx wrangler` on demand).
- Optional for tunnels: one of `cloudflared`, `ngrok`, or `localtunnel` (the scripts pick what’s available).

Tip: If you’re on a Chromebook/ChromeOS, make sure the repo lives in your Linux workspace and your Node tooling runs there.

## 1) Update Dependencies

Why: keep this repo current with its npm dependency ranges.

Commands:
- Update package.json ranges: `npx ncu -u`
- Install exact versions: `npm install`

Notes:
- `ncu -u` (npm‑check‑updates) updates ranges in package.json. You still need `npm install` to lock versions in `package-lock.json`.
- If anything breaks, you can revert the changes to package.json and try again selectively.

## 2) Configure Secrets (Local Dev)

The Worker uses an auth signing secret. For local development, the scripts read `AUTH_SECRET` from `wrangler.jsonc` or the environment.

Options:
- Quick start: do nothing (a dev secret is present in `wrangler.jsonc`).
- Prefer environment: `export AUTH_SECRET="your-strong-dev-secret"`

## 3) Initialize Databases Automatically

Use the combined dev script — it starts the Worker locally and runs a one‑by‑one schema init when the server is up.

Command:
- `npm run dev:with-init`

What it does:
- Runs `wrangler dev` on `http://0.0.0.0:444`.
- `scripts/wait-and-init.mjs` polls `/auth/whoami` until ready, then POSTs `/admin/db/init` with your `AUTH_SECRET`.
- This creates/updates D1 tables: `users`, `sessions`, `games`, `lobby_rooms`, `lobby_members`, plus analytics tables in the `DB` binding.

Open:
- `http://127.0.0.1:444`

## 4) WebSocket Backend Options

The UI talks WebSocket at `/api/game/:id/websocket`. In this repo, that WS route forwards to a separate Worker service called `game-sockets`. If you don’t have that Worker running, use the local WS helper instead.

Option A — Use the local WS helper (no extra Worker):
- Install helper dep once: `npm i -D ws`
- Start helper (second terminal): `node server/local-ws/index.js`
- Open the UI with an override so the client connects to the helper:
  - URL param: `http://127.0.0.1:444/?ws=ws://127.0.0.1:9999`
  - or in DevTools: `localStorage.setItem('WS_ORIGIN','ws://127.0.0.1:9999')` then reload

Option B — Use your deployed `game-sockets` Worker:
- Ensure a Cloudflare Worker named `game-sockets` is deployed in the same account.
- In this repo, `wrangler.jsonc` already binds `GAME_SOCKETS` to `service: "game-sockets"`.
- Run `npm run dev:with-init` and open `http://127.0.0.1:444` (no `?ws=` needed).

Troubleshooting:
- If the page shows “Connection error”, you likely don’t have a WS server reachable. Use Option A or deploy `game-sockets`.

## 5) Expose Your Local Game to the Internet

The quickest way is the auto‑tunnel script. It launches the app, initializes DBs, and brings up a tunnel using whatever it finds (`cloudflared` > `ngrok` > `localtunnel`).

Command:
- `npm run dev:tunnel:auto`

Outputs:
- You’ll see a public URL in the terminal. Share that URL. If you used the local WS helper, expose it as well (separate tunnel on port 9999) and pass its public `wss://` URL via `?ws=`.

Specific providers:
- Cloudflared: install the `cloudflared` binary in your PATH. The script runs an ephemeral tunnel.
- Ngrok: `npm i` already includes it; set `NGROK_AUTHTOKEN` env var for stable domains.
- Localtunnel: works without an account; the host is random on each run.

## 6) Deploy to Cloudflare

When you’re ready to publish the Worker to your Cloudflare account:

Commands:
- Build & publish: `npm run deploy`
- Initialize D1 on your production route: `INIT_URL=https://monopoly.hwmnbn.me npm run deploy:with-init`

Requirements:
- `wrangler login` completed on your machine.
- Your domain `monopoly.hwmnbn.me` is routed to this Worker (see `wrangler.jsonc` routes). Adjust if you use another hostname.
- If using the `game-sockets` service, ensure it is deployed and named exactly `game-sockets` (matches the service binding).

## 7) Daily Ops & Useful Commands

- Reset local D1 (fresh dev DBs): `npm run db:reset:local`
- Seed/re‑init local D1: `npm run db:setup:local`
- List open lobbies (dev): GET `http://127.0.0.1:444/api/lobby/list`
- Recent game id (dev): GET `http://127.0.0.1:444/api/games/recent`

## 8) Common Issues

WebSocket won’t connect
- Cause: No `game-sockets` Worker deployed and no local helper running.
- Fix: Run `node server/local-ws/index.js` and add `?ws=ws://127.0.0.1:9999` to the URL.

DB init fails with unauthorized
- Cause: `AUTH_SECRET` mismatch.
- Fix: Export `AUTH_SECRET` in your shell, or ensure it matches the value in `wrangler.jsonc` while in dev.

Images 404
- The image handler falls back to a placeholder if assets are missing. Confirm the path `/img/<name>?preset=icon&format=auto` and check `public/images/`.

## 9) Summary Quick Path

For a simple local run (no extra WS Worker):
1. `npx ncu -u`
2. `npm install`
3. `npm run dev:with-init`
4. In another terminal: `npm i -D ws && node server/local-ws/index.js`
5. Open: `http://127.0.0.1:444/?ws=ws://127.0.0.1:9999`

To share online quickly:
6. `npm run dev:tunnel:auto`

To deploy:
7. `npm run deploy`
8. `INIT_URL=https://monopoly.hwmnbn.me npm run deploy:with-init`

