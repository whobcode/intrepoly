# Resume Conversation - Intrepoly Project

## 📍 Current Status (2025-12-29)

### ✅ Completed Tasks

1. **Fixed D1 Database Error** ✅
   - Changed `.exec()` to `.prepare().run()` in `src/db.ts`
   - Database initialization now works correctly

2. **Domain Updated** ✅
   - Changed from `monopoly.hwmnbn.me` → `intrepoly.hwmnbn.me`

3. **Port Fixed** ✅
   - Changed from 444 (requires root) → 8787

4. **Dependencies Fixed** ✅
   - Created local `src/board-data.ts` with all Monopoly game data

5. **WebRTC Video Chat Added** ✅
   - Peer-to-peer video connections for 2-8 players
   - Video thumbnails in sidebar under logs

6. **Menu Page & Game Flow** ✅ (NEW - 2025-12-29)
   - Created `public/menu.html` - Post-login menu with Start Game button
   - Login now redirects to menu page
   - Player count selection (4 or 8 players) after clicking Start Game
   - Removed Start Game button from in-game controls

7. **Named AI Agents with Personalities** ✅ (NEW - 2025-12-29)
   - 7 unique AI characters with distinct personalities:
     - **Tony** (crimson) - Wall Street swagger, ambition quotes
     - **Raven** (purple) - Philosophical, fate/patience wisdom
     - **Kierra** (gold) - Inspirational, perseverance/loyalty
     - **Kitra** (teal) - Analytical, mathematical precision
     - **Jubilee** (orange) - Charismatic, bold creativity
     - **Niccollus** (navy) - Machiavellian, power dynamics
     - **Shay** (lime) - Zen master, patience/balance
   - 4-player games: Tony, Raven, Kierra
   - 8-player games: All 7 agents

8. **AI Chat Enhanced** ✅ (NEW - 2025-12-29)
   - AI agents use unique personality prompts
   - Share strategic Monopoly tips based on game events
   - Generate quotes about life, love, loyalty with explanations

9. **Dynamic Player Replacement** ✅ (NEW - 2025-12-29)
   - New human players replace random AI when joining
   - Host sets player count, joiners bypass selection
   - Game remembers `maxPlayers` and `hostPlayerId`

10. **Chat & Event Log Visibility** ✅ (NEW - 2025-12-29)
    - Fixed CSS selectors (#chatbox → #chat)
    - Event log and chat now properly shown when game starts

11. **Go Arrow Fixed** ✅
    - Arrow SVG flipped with CSS `transform: scaleX(-1)`

12. **Unified SSO for *.hwmnbn.me** ✅ (NEW - 2025-12-30)
    - Implemented cross-subdomain Single Sign-On
    - Session cookies set to `.hwmnbn.me` domain
    - New SSO endpoints:
      - `GET/POST /auth/sso/validate` - Validate session from any subdomain
      - `GET /auth/sso/config` - Get SSO integration config
    - Full CORS support for all auth endpoints
    - Other *.hwmnbn.me sites can now:
      - Call `/auth/sso/validate` with `credentials: 'include'`
      - OR bind to the same `monopolyd1` D1 database
    - Created `SSO.md` documentation for integration

---

### ⚠️ Pending / In Progress

1. **Ollama AI Integration**
   - Package installed but not fully integrated
   - Currently using Cloudflare AI models

2. **GAME_SOCKETS Binding**
   - Service binding exists but worker not created
   - Game still works via Durable Objects directly

3. **Email Notifications**
   - Email templates exist in CLAUDE.md
   - Need to integrate with signup/login flow

---

## 🎮 Game Flow (Updated)

```
1. User visits / (index.html)
   ↓
2. Not logged in? → Show login modal
   Logged in without game hash? → Redirect to /menu.html
   ↓
3. Menu Page (/menu.html):
   - Enter display name & color
   - Click "Start New Game" → Choose 4 or 8 players
   - Or join with game code
   ↓
4. Redirected to /#game-id
   - Host: Game fills with named AI agents
   - Joiner: Replaces a random AI
   ↓
5. Game plays with chat, video, AI banter
```

---

## 🤖 AI Agent Details

| Agent | Personality | Quote Style |
|-------|-------------|-------------|
| Tony | Wall Street trader | Ambition, power, deals |
| Raven | Philosopher | Fate, patience, mystery |
| Kierra | Champion | Perseverance, loyalty, honor |
| Kitra | Analyst | Math, probability, logic |
| Jubilee | Creative | Bold moves, joy, risk |
| Niccollus | Machiavelli | Power, leverage, strategy |
| Shay | Zen master | Balance, peace, patience |

Each agent uses a different Cloudflare AI model for variety.

---

## 📁 Key Files (Updated)

### New Files
- `public/menu.html` - Post-login menu page
- `SSO.md` - Cross-subdomain SSO integration documentation

### Modified Files (2025-12-29 & 2025-12-30)
- `public/js/main.js` - Login redirects, sessionStorage, auto-start
- `public/js/api.js` - Pass playerCount/isHost in join
- `public/js/ui.js` - Show eventlog/chat on game start
- `public/index.html` - Removed Start Game button from controls
- `public/styles.css` - Fixed chat CSS selectors
- `src/game.ts` - Named AI agents, player replacement, personalities
- `src/board-data.ts` - Added personality, maxPlayers, hostPlayerId fields
- `src/index.ts` - SSO endpoints, CORS support for all auth routes

---

## 🚀 Quick Start

```bash
# Navigate to project
cd /home/marswc/github/intrepoly

# Kill any existing servers
pkill -9 -f wrangler

# Start dev server
npm run dev:with-init

# Open in browser
open http://localhost:8787
```

---

## 🔑 Important Info

### Admin Access
- **Username:** `whobcode13`
- **Password:** ANY (bypassed in code)

### URLs
- **Dev:** `http://localhost:8787`
- **Prod:** `https://intrepoly.hwmnbn.me`
- **Menu:** `/menu.html`
- **Game:** `/#game-id`

---

## 📋 Next Tasks

### High Priority
1. **Test the new game flow** in browser
2. **Deploy to production** with `npm run deploy:with-init`
3. **Verify AI agent chat** works with personalities

### Medium Priority
4. **Integrate email notifications** from CLAUDE.md templates
5. **Fix remaining bugs** from bug scanner

### Low Priority
6. **Complete Ollama integration** as alternative to Cloudflare AI
7. **Create GAME_SOCKETS worker** or remove binding

---

## 💾 Save Point

**Date:** 2025-12-29
**Branch:** main

**Recent Changes:**
- Menu page with player count selection
- 7 named AI agents with unique personalities
- Dynamic AI replacement when humans join
- Enhanced AI chat with quotes and tips
- Fixed chat/eventlog visibility

**To commit:**
```bash
git add -A
git commit -m "feat: Add menu page, named AI agents, and game flow improvements

- Created menu.html for post-login game setup
- Added 7 named AI agents (Tony, Raven, Kierra, Kitra, Jubilee, Niccollus, Shay)
- Each AI has unique personality and quote style
- Player count selection (4 or 8) with AI auto-fill
- New players replace random AI when joining
- Enhanced AI chat with strategic tips and quotes
- Fixed chat/eventlog visibility on game start
- Removed Start Game from in-game controls

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

**Ready to resume!** The game now has a proper menu flow and personality-rich AI opponents. 🎲
