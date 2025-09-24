# Setup (Monopoly)

Prerequisites
- Node 20+ and npm
- Wrangler CLI v4.35+; wrangler login

Resources
- Durable Object: GAME (auto on deploy)
- Assets: site.bucket → ./public (Workers Sites)
- AI binding: AI (preselected model)
- Images binding: IMAGES (Cloudflare Images)
 - D1 bindings:
   - monopolyd1 (core users/sessions/games)
   - monopolyui (lobby UI)

Commands
- Dev: npx wrangler dev
- Deploy: npx wrangler deploy

Notes
- No KV/D1/Queues required by default.
- Customize AI model in wrangler.jsonc if needed.
- Cloudflare Images is enabled via `images.binding = IMAGES` in `wrangler.jsonc`.
- The Worker exposes `/img/*` for optimized delivery with presets and format negotiation.

Images route `/img/*`
- Params: `preset`, `w`, `h`, `format=auto|avif|webp|png|jpeg`, `q=1..100`.
- Presets: `icon|tile`→40w, `arrow`→30w, `die|dice`→40w, `token`→16w.
- Extra presets: `thumb`→64w, `badge`→24w, `avatar`→48w, `logo`→96w, `card`→120w, `tile-2x`→80w.
- Missing assets generate a placeholder SVG that is encoded to the negotiated format.

Auth (simple demo)
- Endpoints: `POST /auth/login { username }`, `POST /auth/logout`, `GET /auth/whoami`.
- Cookie: `SESSION` signed using `AUTH_SECRET` (set in `wrangler.jsonc`).
- UI: Top-right Sign in/out; start button requires login.

D1 (optional for now)
- Binding `DB` with name `monopoly_db`. Initialize tables on first login.
- Tables: `users`, `sessions` (reserved), `games`.
