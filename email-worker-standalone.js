/**
 * Standalone Email Worker for hwmnbn.me
 * Copy and paste this entire script into Cloudflare Dashboard > Workers > Create > Quick Edit
 *
 * Required bindings (configure in Settings > Bindings):
 * - D1 Database: DB (for email logs)
 * - KV Namespace: RATE_LIMIT (for rate limiting)
 * - Send Email: EMAIL (for sending outbound emails)
 * - Environment Variable: FORWARD_TO = "your-email@gmail.com"
 *
 * Email Routing Setup (Dashboard > Email > Email Routing > Routing Rules):
 * - noreply@hwmnbn.me -> This Worker
 * - signin@hwmnbn.me -> This Worker
 * - signup@hwmnbn.me -> This Worker
 * - support@hwmnbn.me -> This Worker
 * - info@hwmnbn.me -> This Worker
 * - contact@hwmnbn.me -> This Worker
 * - Catch-all (*@hwmnbn.me) -> This Worker
 */

// Import EmailMessage from Cloudflare's email module
import { EmailMessage } from 'cloudflare:email';

// ============================================
// EMAIL TEMPLATES
// ============================================

function createWelcomeEmail(username, verifyUrl) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #c32222, #8a1818); padding: 30px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 28px;">🎲 whoBmonopoly</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0;">Welcome to the game!</p>
    </div>
    <div style="padding: 30px;">
      <h2 style="color: #333; margin-top: 0;">Hey ${username}! 👋</h2>
      <p style="color: #555; line-height: 1.6;">Thanks for signing up! Please verify your email address:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="display: inline-block; background: #c32222; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 16px;">
          ✅ Verify Email Address
        </a>
      </div>
      <p style="color: #888; font-size: 13px;">This link expires in 24 hours.</p>
    </div>
    <div style="background: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #999; font-size: 12px; margin: 0;">© 2025 whoBmonopoly</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Welcome to whoBmonopoly, ${username}!\n\nVerify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`;
  return { html, text };
}

function createLoginSuccessEmail(username, ip, userAgent) {
  const loginTime = new Date().toUTCString();
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #48bb78, #38a169); padding: 30px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 28px;">✅ Login Successful</h1>
    </div>
    <div style="padding: 30px;">
      <h2 style="color: #333; margin-top: 0;">Hello ${username}!</h2>
      <p style="color: #555;">You've successfully signed in to your whoBmonopoly account.</p>
      <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px; color: #666; font-size: 14px;"><strong>Time:</strong> ${loginTime}</p>
        <p style="margin: 0 0 8px; color: #666; font-size: 14px;"><strong>IP:</strong> ${ip}</p>
        <p style="margin: 0; color: #666; font-size: 14px;"><strong>Device:</strong> ${(userAgent || '').substring(0, 50)}...</p>
      </div>
      <p style="color: #888; font-size: 13px;">If this wasn't you, contact support@hwmnbn.me immediately.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Login Successful - whoBmonopoly\n\nHello ${username},\n\nYou've signed in successfully.\n\nTime: ${loginTime}\nIP: ${ip}\n\nIf this wasn't you, contact support@hwmnbn.me`;
  return { html, text };
}

function createNoReplyResponse() {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; padding: 20px;">
  <h2>📭 This is a no-reply address</h2>
  <p>This mailbox is not monitored. Your email has not been received.</p>
  <p>For support: <a href="mailto:support@hwmnbn.me">support@hwmnbn.me</a></p>
</body>
</html>`;
  const text = `This is a no-reply address. Contact support@hwmnbn.me for help.`;
  return { html, text };
}

// ============================================
// UTILITIES
// ============================================

async function checkRateLimit(env, key, limit, windowSec) {
  if (!env.RATE_LIMIT) return true;
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `rl:${key}:${Math.floor(now / windowSec)}`;
  const current = parseInt(await env.RATE_LIMIT.get(windowKey) || '0', 10);
  if (current >= limit) return false;
  await env.RATE_LIMIT.put(windowKey, String(current + 1), { expirationTtl: windowSec * 2 });
  return true;
}

async function logEmail(env, from, to, subject, action, status) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO email_logs (from_addr, to_addr, subject, action, status, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(from, to, (subject || '').substring(0, 255), action, status).run();
  } catch (e) {
    console.error('Log error:', e);
  }
}

function createMimeEmail(from, to, subject, html, text) {
  const boundary = '----=_Part_' + Math.random().toString(36).substring(2);
  const raw = [
    `From: whoBmonopoly <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    `--${boundary}--`
  ].join('\r\n');

  return new EmailMessage(from, to, raw);
}

// ============================================
// MAIN EXPORT
// ============================================

export default {
  // Handle inbound emails
  async email(message, env, ctx) {
    const fromEmail = message.from;
    const toEmail = message.to;
    const toLocal = toEmail.split('@')[0].toLowerCase();

    // Parse subject from raw email
    const rawBody = await new Response(message.raw).text();
    const subjectMatch = rawBody.match(/^Subject:\s*(.*)$/mi);
    const subject = subjectMatch ? subjectMatch[1].trim() : '(no subject)';

    console.log(`📧 ${fromEmail} -> ${toEmail} | ${subject}`);

    // Handle by address type
    switch (toLocal) {
      case 'noreply':
      case 'no-reply':
        await logEmail(env, fromEmail, toEmail, subject, 'noreply', 'rejected');
        // Send auto-reply
        if (env.EMAIL) {
          try {
            const { html, text } = createNoReplyResponse();
            const reply = createMimeEmail('noreply@hwmnbn.me', fromEmail, 'Re: ' + subject, html, text);
            await env.EMAIL.send(reply);
          } catch (e) {
            console.error('Auto-reply failed:', e);
          }
        }
        break;

      case 'signup':
      case 'sign-up':
      case 'register':
        if (!await checkRateLimit(env, `signup:${fromEmail}`, 3, 3600)) {
          await logEmail(env, fromEmail, toEmail, subject, 'signup', 'rate_limited');
          return;
        }
        await logEmail(env, fromEmail, toEmail, subject, 'signup', 'received');
        if (env.FORWARD_TO) await message.forward(env.FORWARD_TO);
        break;

      case 'signin':
      case 'sign-in':
      case 'login':
        if (!await checkRateLimit(env, `signin:${fromEmail}`, 10, 3600)) {
          await logEmail(env, fromEmail, toEmail, subject, 'signin', 'rate_limited');
          return;
        }
        await logEmail(env, fromEmail, toEmail, subject, 'signin', 'received');
        if (env.FORWARD_TO) await message.forward(env.FORWARD_TO);
        break;

      case 'support':
      case 'help':
        if (!await checkRateLimit(env, `support:${fromEmail}`, 10, 3600)) {
          await logEmail(env, fromEmail, toEmail, subject, 'support', 'rate_limited');
          return;
        }
        await logEmail(env, fromEmail, toEmail, subject, 'support', 'received');
        if (env.FORWARD_TO) {
          await message.forward(env.FORWARD_TO);
          await logEmail(env, fromEmail, toEmail, subject, 'support', 'forwarded');
        }
        break;

      case 'info':
      case 'contact':
      case 'hello':
        await logEmail(env, fromEmail, toEmail, subject, toLocal, 'received');
        if (env.FORWARD_TO) {
          await message.forward(env.FORWARD_TO);
          await logEmail(env, fromEmail, toEmail, subject, toLocal, 'forwarded');
        }
        break;

      default:
        // Catch-all
        await logEmail(env, fromEmail, toEmail, subject, 'catch-all', 'received');
        if (env.FORWARD_TO) await message.forward(env.FORWARD_TO);
    }
  },

  // HTTP API for programmatic email sending
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', time: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Send verification email (POST /api/send-verification)
    if (url.pathname === '/api/send-verification' && request.method === 'POST') {
      try {
        const { email, username, token } = await request.json();
        const verifyUrl = `https://intrepoly.hwmnbn.me/auth/verify?token=${token}`;
        const { html, text } = createWelcomeEmail(username, verifyUrl);
        const msg = createMimeEmail('noreply@hwmnbn.me', email, 'Verify your whoBmonopoly account', html, text);
        await env.EMAIL.send(msg);
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }

    // Send login notification (POST /api/send-login-notification)
    if (url.pathname === '/api/send-login-notification' && request.method === 'POST') {
      try {
        const { email, username, ip, userAgent } = await request.json();
        const { html, text } = createLoginSuccessEmail(username, ip || 'Unknown', userAgent || 'Unknown');
        const msg = createMimeEmail('signin@hwmnbn.me', email, 'Login successful - whoBmonopoly', html, text);
        await env.EMAIL.send(msg);
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }

    // Stats endpoint
    if (url.pathname === '/api/stats' && env.DB) {
      const stats = await env.DB.prepare(`
        SELECT action, status, COUNT(*) as count FROM email_logs
        WHERE created_at > datetime('now', '-24 hours') GROUP BY action, status
      `).all();
      return new Response(JSON.stringify(stats.results), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('whoBmonopoly Email Worker\n\nEndpoints:\n- /health\n- POST /api/send-verification\n- POST /api/send-login-notification\n- /api/stats', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

/*
SQL to create email_logs table (run in D1 console):

CREATE TABLE IF NOT EXISTS email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_logs_created ON email_logs(created_at DESC);
CREATE INDEX idx_email_logs_action ON email_logs(action);
*/
