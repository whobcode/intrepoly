# Intrepoly - Fixes & Setup Guide

## ✅ Issues Fixed

### 1. D1 Database Initialization Error - FIXED ✅
**Problem:** `TypeError: Cannot read properties of undefined (reading 'duration')`

**Root Cause:** The `D1Database.exec()` method was causing issues with Cloudflare's internal metadata aggregation.

**Solution:** Changed from `.exec()` to `.prepare().run()` in all three init functions:
- `initCore()` in `src/db.ts`
- `initUi()` in `src/db.ts`
- `initApp()` in `src/db.ts`

**Status:** Database initialization now works correctly! ✅

### 2. Port Permission Issue - FIXED ✅
**Problem:** Port 444 requires root privileges

**Solution:**
- Changed port from 444 → 8787 in `wrangler.jsonc`
- Updated all npm scripts in `package.json`
- Added `npx` prefix to all wrangler commands

**Status:** Server runs without sudo! ✅

### 3. Domain Update - FIXED ✅
**Problem:** Was using `monopoly.hwmnbn.me`, needed `intrepoly.hwmnbn.me`

**Solution:** Updated domain in:
- `wrangler.jsonc`
- `package.json`
- `README.md`

**Status:** All references updated! ✅

---

## 🔐 Admin Access (whobcode13)

### Admin Bypass Status: ✅ WORKING

The admin bypass for username `whobcode13` is **already implemented** in `src/index.ts:617-618`:

```typescript
// Passwordless bypass for whobcode13 account
if (user && (user.username === 'whobcode13' || email.startsWith('whobcode13@'))) {
  const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
  const token = await signSession(authSecret, { sub: user.username || email, iat: Date.now() });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Set-Cookie': setCookie('SESSION', token, { maxAge: 60 * 60 * 24 * 30 }), 'Content-Type': 'application/json' }
  });
}
```

### How to Use Admin Bypass:

1. **First Time Setup - Create the whobcode13 user:**
   ```bash
   curl -X POST http://localhost:8787/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"whobcode13@example.com","username":"whobcode13","password":"any_password_it_wont_be_used"}'
   ```

2. **Login (bypasses password check):**
   ```bash
   curl -X POST http://localhost:8787/auth/login-email \
     -H "Content-Type: application/json" \
     -d '{"email":"whobcode13@example.com","password":"literally_anything"}'
   ```

   The password field can be **anything** - it won't be checked for `whobcode13`!

3. **Or use simple username login:**
   ```bash
   curl -X POST http://localhost:8787/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"whobcode13"}'
   ```

---

## 🔧 Sign In/Sign Up Functionality

### Current Status: Backend Works ✅, Frontend May Need Fixes ⚠️

**Backend Endpoints (All Working):**
- `POST /auth/signup` - Create new account
- `POST /auth/login` - Simple username login
- `POST /auth/login-email` - Email + password login
- `GET /auth/whoami` - Check current session
- `POST /auth/logout` - End session

### Testing Authentication:

```bash
# Start the dev server
npm run dev:with-init

# In another terminal:

# 1. Sign up a new user
curl -X POST http://localhost:8787/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"testpass123"}' \
  -c cookies.txt

# 2. Login with email
curl -X POST http://localhost:8787/auth/login-email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}' \
  -c cookies.txt

# 3. Check who you are
curl -X GET http://localhost:8787/auth/whoami \
  -b cookies.txt

# 4. Logout
curl -X POST http://localhost:8787/auth/logout \
  -b cookies.txt
```

### If Frontend Login Buttons Don't Work:

Check these frontend files for issues:
- `public/login.html` - Login page
- `public/signup.html` - Signup page
- `public/js/auth.js` - Auth client-side logic

Common issues:
1. **Incorrect API endpoint** - Should be `/auth/login` or `/auth/login-email`
2. **Missing CORS headers** - Add if calling from different origin
3. **Cookie not being set** - Check browser dev tools → Application → Cookies
4. **JavaScript errors** - Check browser console for errors

---

## 📧 Email Notifications

### Current Status: ❌ NOT IMPLEMENTED

**Why no emails?**
Cloudflare Workers don't have built-in email sending capabilities. You need to integrate an email service.

### Options to Add Email:

#### Option 1: Mailgun (Recommended for Production)
```typescript
// Add to package.json
"dependencies": {
  "mailgun.js": "^9.0.0"
}
```

```typescript
// In src/index.ts
import Mailgun from 'mailgun.js';
import formData from 'form-data';

async function sendWelcomeEmail(email: string, username: string, env: Env) {
  const mailgun = new Mailgun(formData);
  const mg = mailgun.client({
    username: 'api',
    key: env.MAILGUN_API_KEY || ''
  });

  await mg.messages.create(env.MAILGUN_DOMAIN || '', {
    from: 'Intrepoly <noreply@intrepoly.hwmnbn.me>',
    to: [email],
    subject: 'Welcome to Intrepoly!',
    text: `Welcome ${username}! Your account has been created.`,
    html: `<h1>Welcome ${username}!</h1><p>Your account has been created.</p>`
  });
}

// Call in handleAuthSignup after creating user:
await sendWelcomeEmail(email, username, env);
```

Add secrets:
```bash
npx wrangler secret put MAILGUN_API_KEY
npx wrangler secret put MAILGUN_DOMAIN
```

#### Option 2: SendGrid
```bash
npm install @sendgrid/mail
```

```typescript
import sgMail from '@sendgrid/mail';

async function sendEmail(to: string, subject: string, html: string, env: Env) {
  sgMail.setApiKey(env.SENDGRID_API_KEY || '');
  await sgMail.send({
    to,
    from: 'noreply@intrepoly.hwmnbn.me',
    subject,
    html
  });
}
```

#### Option 3: Resend (Modern, Simple)
```bash
npm install resend
```

```typescript
import { Resend } from 'resend';

async function sendEmail(to: string, subject: string, html: string, env: Env) {
  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Intrepoly <onboarding@intrepoly.hwmnbn.me>',
    to,
    subject,
    html
  });
}
```

#### Option 4: Cloudflare Email Workers (Advanced)
Use Cloudflare Email Routing + Email Workers to send transactional emails.
See: https://developers.cloudflare.com/email-routing/email-workers/

---

## 🚀 Quick Start Commands

```bash
# 1. Install dependencies
npm install

# 2. Start dev server with auto DB init
npm run dev:with-init

# 3. In browser, go to:
http://localhost:8787

# 4. For tunneled access:
npm run dev:tunnel:auto
```

---

## 🐛 Troubleshooting

### "Address already in use" error
```bash
# Kill all wrangler processes
pkill -9 -f wrangler
pkill -9 -f workerd
pkill -9 -f concurrently

# Then restart
npm run dev:with-init
```

### "DB init failed" error
**Solution:** Already fixed! The D1 error has been resolved by changing `.exec()` to `.prepare().run()`.

### Admin login not working
1. Make sure the `whobcode13` user exists (run the signup curl command above)
2. Use `/auth/login-email` endpoint with ANY password
3. Check that `AUTH_SECRET` is set in wrangler.jsonc

### Frontend buttons don't work
1. Open browser developer tools (F12)
2. Check Console tab for JavaScript errors
3. Check Network tab to see if requests are being sent
4. Verify cookies are being set in Application → Cookies

---

## 📝 Summary of Changes

### Files Modified:
1. `src/db.ts` - Fixed D1 exec() → prepare().run()
2. `wrangler.jsonc` - Port 444 → 8787, domain updated
3. `package.json` - All scripts updated with npx
4. `README.md` - Domain references updated

### Files Created:
- `ARCHITECTURE_COMPARISON.md` - Why this is more complex than Ollama
- `FIXES_AND_SETUP.md` (this file)
- `src/board-data.ts` - Complete Monopoly game data
- `public/js/video-chat.js` - WebRTC implementation
- `VIDEO_CHAT_README.md` - WebRTC documentation

### Known Issues Remaining (from Bug Scanner):
- 35 bugs identified (4 critical, 6 high severity)
- See separate bug report for details
- Most critical: Auction alarm race condition, SQL injection vulnerability

---

## 🎯 Next Steps

1. **Start the server:**
   ```bash
   npm run dev:with-init
   ```

2. **Create admin account:**
   ```bash
   curl -X POST http://localhost:8787/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"whobcode13@example.com","username":"whobcode13","password":"doesnt_matter"}'
   ```

3. **Test admin login:**
   - Open http://localhost:8787
   - Use whobcode13@example.com + any password

4. **Add email service** (optional):
   - Choose: Mailgun, SendGrid, or Resend
   - Add API keys via `wrangler secret put`
   - Implement sendEmail() function

5. **Fix critical bugs:**
   - Remove hardcoded auth bypass (or protect better)
   - Fix auction alarm race condition
   - Address SQL injection vulnerability

---

## 💡 Tips

- **Development:** Use `npm run dev:with-init` for local testing
- **Production:** Use `npm run deploy:with-init` to deploy
- **Debugging:** Check `/home/marswc/.config/.wrangler/logs/` for logs
- **Database:** Use `npm run db:reset:local` to reset local database

**Admin Access:** The `whobcode13` user bypasses password checks - use this for quick development access!
