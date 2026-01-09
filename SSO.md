# Unified SSO for *.hwmnbn.me

This document explains how to integrate Single Sign-On (SSO) across all sites under the `hwmnbn.me` domain.

## Overview

Intrepoly (`intrepoly.hwmnbn.me`) serves as the **SSO authority** for all `*.hwmnbn.me` subdomains. When a user creates an account or logs in on any site, they are automatically authenticated across all sites.

### How It Works

1. **Shared Cookie Domain**: Session cookies are set with `Domain=.hwmnbn.me`, making them accessible to all subdomains
2. **Central Auth API**: Other sites can validate sessions via the `/auth/sso/validate` endpoint
3. **Shared Database** (optional): Workers can bind to the same D1 database for direct user access

## Integration Methods

### Method 1: API Validation (Recommended)

Call the SSO validation endpoint from your site to check if a user is logged in:

```javascript
// Check if user is logged in via SSO
async function checkSsoAuth() {
  try {
    const response = await fetch('https://intrepoly.hwmnbn.me/auth/sso/validate', {
      method: 'GET',
      credentials: 'include'  // REQUIRED: sends cookies cross-origin
    });

    const data = await response.json();

    if (data.valid) {
      console.log('User is logged in:', data.user);
      console.log('User ID:', data.userId);
      console.log('Email:', data.email);
      console.log('Stats:', data.stats);
      return data;
    } else {
      console.log('Not logged in:', data.reason);
      return null;
    }
  } catch (error) {
    console.error('SSO check failed:', error);
    return null;
  }
}
```

### Method 2: Shared Database Binding

For Cloudflare Workers that need direct database access, bind to the same D1 database:

```jsonc
// wrangler.jsonc
{
  "d1_databases": [
    {
      "binding": "USERS_DB",
      "database_name": "monopolyd1",
      "database_id": "5363662e-5cbb-4faf-982a-55b44c847791"
    }
  ],
  "vars": {
    "AUTH_SECRET": "YOUR_SHARED_AUTH_SECRET"  // Must match intrepoly's secret
  }
}
```

Then use the auth utilities directly in your worker:

```typescript
import { verifySession, getCookie } from './auth';  // Copy from intrepoly/src/auth.ts

export default {
  async fetch(request: Request, env: Env) {
    const token = getCookie(request, 'SESSION');
    if (!token) {
      return new Response('Not authenticated', { status: 401 });
    }

    const session = await verifySession(env.AUTH_SECRET, token);
    if (!session?.sub) {
      return new Response('Invalid session', { status: 401 });
    }

    // User is authenticated as session.sub (username)
    const user = await env.USERS_DB.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(session.sub).first();

    // Continue with authenticated user...
  }
};
```

## SSO Endpoints

All endpoints support CORS for `*.hwmnbn.me` subdomains.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/sso/validate` | GET/POST | Validate session, returns user info |
| `/auth/sso/config` | GET | Returns SSO configuration |
| `/auth/login-email` | POST | Login with email/password |
| `/auth/signup` | POST | Create new account |
| `/auth/logout` | POST | Logout (clears session) |
| `/auth/whoami` | GET | Get current user info |
| `/auth/magic-link/request` | POST | Request magic link login |

### SSO Validate Response

```json
{
  "valid": true,
  "user": "username",
  "userId": 123,
  "gamerId": "abc123...",
  "email": "user@example.com",
  "emailVerified": true,
  "stats": {
    "wins": 5,
    "losses": 3,
    "credits": 100
  },
  "iat": 1703865600000,
  "provider": "session"
}
```

Or if not authenticated:
```json
{
  "valid": false,
  "reason": "no_session"
}
```

## Frontend Integration Example

Add this to any `*.hwmnbn.me` site to enable SSO:

```javascript
// sso.js - Add to your site
class HwmnbnSSO {
  constructor() {
    this.ssoEndpoint = 'https://intrepoly.hwmnbn.me';
    this.user = null;
  }

  async checkAuth() {
    try {
      const res = await fetch(`${this.ssoEndpoint}/auth/sso/validate`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.valid) {
        this.user = data;
        return data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async login(email, password) {
    const res = await fetch(`${this.ssoEndpoint}/auth/login-email`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.ok) {
      await this.checkAuth();  // Refresh user data
    }
    return data;
  }

  async signup(email, username, password) {
    const res = await fetch(`${this.ssoEndpoint}/auth/signup`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password })
    });
    return res.json();
  }

  async logout() {
    await fetch(`${this.ssoEndpoint}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    this.user = null;
  }

  async requestMagicLink(email) {
    const res = await fetch(`${this.ssoEndpoint}/auth/magic-link/request`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return res.json();
  }

  redirectToLogin() {
    window.location.href = `${this.ssoEndpoint}/?redirect=${encodeURIComponent(window.location.href)}`;
  }
}

// Usage
const sso = new HwmnbnSSO();

// Check if user is logged in on page load
sso.checkAuth().then(user => {
  if (user) {
    console.log('Logged in as:', user.user);
  } else {
    console.log('Not logged in');
    // Optionally redirect to login
    // sso.redirectToLogin();
  }
});
```

## Database Schema

The shared `monopolyd1` database uses this schema for users:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  password_hash TEXT,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  credits INTEGER DEFAULT 0,
  wallet_amount INTEGER DEFAULT 0,
  wallet_id TEXT,
  online INTEGER DEFAULT 0,
  gamer_id TEXT UNIQUE,
  email_verified INTEGER DEFAULT 0,
  verification_token TEXT,
  verification_expires TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

## Security Notes

1. **AUTH_SECRET**: All workers must use the same `AUTH_SECRET` to validate session tokens. Store this as a Wrangler secret:
   ```bash
   npx wrangler secret put AUTH_SECRET
   ```

2. **HTTPS Only**: Session cookies are set with `Secure` flag, requiring HTTPS

3. **Same-Site Policy**: Cookies use `SameSite=Lax` for CSRF protection while allowing cross-subdomain access

4. **CORS Restrictions**: Only `*.hwmnbn.me` origins are allowed for cross-origin auth requests

## Troubleshooting

### "No session" error when calling /auth/sso/validate
- Ensure you're using `credentials: 'include'` in your fetch request
- Verify the site is served over HTTPS
- Check that cookies are not being blocked by the browser

### Session works on some subdomains but not others
- Verify all workers use the same `AUTH_SECRET`
- Check that the cookie domain is `.hwmnbn.me` (with leading dot)

### CORS errors
- Only `*.hwmnbn.me` subdomains are allowed
- Ensure your origin header matches `something.hwmnbn.me`
