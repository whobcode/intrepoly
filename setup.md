# Setup (Monopoly)

Prerequisites
- Node 20+ and npm
- Wrangler CLI v4.35+; wrangler login

Resources
- Durable Object: GAME (auto on deploy)
- Assets: site.bucket → ./public (Workers Sites)
- AI binding: AI (preselected model)

Commands
- Dev: npx wrangler dev
- Deploy: npx wrangler deploy

Notes
- No KV/D1/Queues required by default.
- Customize AI model in wrangler.jsonc if needed.

