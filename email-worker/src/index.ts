/**
 * Production-Ready Email Worker for hwmnbn.me
 *
 * Handles:
 * - signup@hwmnbn.me - User registration with email verification
 * - signin@hwmnbn.me - Login notifications with success confirmation
 * - noreply@hwmnbn.me - Auto-reply rejection
 * - support@, info@, contact@ - Forward to admin
 *
 * Deploy: cd email-worker && npm install && npm run deploy
 */

import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

export interface Env {
  // Forward destination for admin emails
  FORWARD_TO: string;
  // D1 Database for user management and email logs
  DB: D1Database;
  // KV for rate limiting and tokens
  RATE_LIMIT: KVNamespace;
  // Secret for signing tokens
  AUTH_SECRET: string;
  // Send email binding for outbound emails
  EMAIL: SendEmail;
}

interface SendEmail {
  send(message: EmailMessage): Promise<void>;
}

// ============================================
// EMAIL TEMPLATES
// ============================================

function createWelcomeEmail(username: string, verifyUrl: string): { html: string; text: string } {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to whoBmonopoly!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #c32222, #8a1818); padding: 30px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 28px;">🎲 whoBmonopoly</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0;">Welcome to the game!</p>
    </div>
    <div style="padding: 30px;">
      <h2 style="color: #333; margin-top: 0;">Hey ${username}! 👋</h2>
      <p style="color: #555; line-height: 1.6;">
        Thanks for signing up for whoBmonopoly! You're almost ready to start playing.
      </p>
      <p style="color: #555; line-height: 1.6;">
        Please verify your email address by clicking the button below:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="display: inline-block; background: #c32222; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 16px;">
          ✅ Verify Email Address
        </a>
      </div>
      <p style="color: #888; font-size: 13px;">
        Or copy this link: <a href="${verifyUrl}" style="color: #c32222;">${verifyUrl}</a>
      </p>
      <p style="color: #888; font-size: 13px;">
        This link expires in 24 hours. If you didn't sign up, you can ignore this email.
      </p>
    </div>
    <div style="background: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #999; font-size: 12px; margin: 0;">
        © 2025 whoBmonopoly | <a href="https://intrepoly.hwmnbn.me" style="color: #c32222;">Play Now</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `
Welcome to whoBmonopoly, ${username}!

Thanks for signing up! Please verify your email by clicking this link:
${verifyUrl}

This link expires in 24 hours.

If you didn't sign up, you can ignore this email.

- The whoBmonopoly Team
`;

  return { html, text };
}

function createLoginSuccessEmail(username: string, ip: string, userAgent: string): { html: string; text: string } {
  const loginTime = new Date().toUTCString();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login Successful</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #48bb78, #38a169); padding: 30px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 28px;">✅ Login Successful</h1>
    </div>
    <div style="padding: 30px;">
      <h2 style="color: #333; margin-top: 0;">Hello ${username}!</h2>
      <p style="color: #555; line-height: 1.6;">
        You've successfully signed in to your whoBmonopoly account.
      </p>
      <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px; color: #666; font-size: 14px;"><strong>Time:</strong> ${loginTime}</p>
        <p style="margin: 0 0 8px; color: #666; font-size: 14px;"><strong>IP Address:</strong> ${ip}</p>
        <p style="margin: 0; color: #666; font-size: 14px;"><strong>Device:</strong> ${userAgent.substring(0, 60)}...</p>
      </div>
      <p style="color: #888; font-size: 13px;">
        If this wasn't you, please contact support immediately at support@hwmnbn.me
      </p>
      <div style="text-align: center; margin-top: 30px;">
        <a href="https://intrepoly.hwmnbn.me" style="display: inline-block; background: #48bb78; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">
          🎲 Play Now
        </a>
      </div>
    </div>
    <div style="background: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #999; font-size: 12px; margin: 0;">
        © 2025 whoBmonopoly | This is an automated security notification
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `
Login Successful - whoBmonopoly

Hello ${username},

You've successfully signed in to your whoBmonopoly account.

Login Details:
- Time: ${loginTime}
- IP Address: ${ip}
- Device: ${userAgent.substring(0, 60)}

If this wasn't you, please contact support@hwmnbn.me immediately.

- The whoBmonopoly Team
`;

  return { html, text };
}

function createMagicLinkEmail(username: string, magicLinkUrl: string): { html: string; text: string } {
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
      <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0;">Sign in with one click</p>
    </div>
    <div style="padding: 30px;">
      <h2 style="color: #333; margin-top: 0;">Hey ${username}! 👋</h2>
      <p style="color: #555; line-height: 1.6;">Click the button below to sign in instantly - no password needed!</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${magicLinkUrl}" style="display: inline-block; background: linear-gradient(135deg, #c32222, #8a1818); color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 16px;">
          🔐 Sign In Now
        </a>
      </div>
      <p style="color: #888; font-size: 13px;">This link expires in 15 minutes and can only be used once.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
    <div style="background: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #999; font-size: 12px; margin: 0;">© 2025 whoBmonopoly</p>
    </div>
  </div>
</body>
</html>`;

  const text = `
Hey ${username}!

Sign in to whoBmonopoly with one click:
${magicLinkUrl}

This link expires in 15 minutes and can only be used once.

If you didn't request this, you can safely ignore this email.

- The whoBmonopoly Team
`;

  return { html, text };
}

function createNoReplyAutoResponse(): { html: string; text: string } {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; padding: 20px;">
  <h2>📭 This is a no-reply address</h2>
  <p>This mailbox is not monitored. Your email has not been received.</p>
  <p>For support, please contact: <a href="mailto:support@hwmnbn.me">support@hwmnbn.me</a></p>
  <p>- whoBmonopoly Team</p>
</body>
</html>`;

  const text = `
This is a no-reply address.

This mailbox is not monitored. Your email has not been received.

For support, please contact: support@hwmnbn.me

- whoBmonopoly Team
`;

  return { html, text };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

async function checkRateLimit(env: Env, key: string, limit: number, windowSec: number): Promise<boolean> {
  if (!env.RATE_LIMIT) return true;
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `ratelimit:${key}:${Math.floor(now / windowSec)}`;
  const current = parseInt(await env.RATE_LIMIT.get(windowKey) || '0', 10);
  if (current >= limit) return false;
  await env.RATE_LIMIT.put(windowKey, String(current + 1), { expirationTtl: windowSec * 2 });
  return true;
}

async function logEmail(env: Env, from: string, to: string, subject: string, action: string, status: string) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`
      INSERT INTO email_logs (from_addr, to_addr, subject, action, status, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(from, to, subject?.substring(0, 255) || '', action, status).run();
  } catch (e) {
    console.error('Failed to log email:', e);
  }
}

function createEmailMessage(from: string, to: string, subject: string, htmlBody: string, textBody: string): EmailMessage {
  const msg = createMimeMessage();
  msg.setSender({ name: 'whoBmonopoly', addr: from });
  msg.setRecipient(to);
  msg.setSubject(subject);
  msg.addMessage({ contentType: 'text/plain', data: textBody });
  msg.addMessage({ contentType: 'text/html', data: htmlBody });
  return new EmailMessage(from, to, msg.asRaw());
}

// ============================================
// EMAIL HANDLERS
// ============================================

async function handleSignup(env: Env, message: EmailMessage, fromEmail: string, subject: string): Promise<void> {
  console.log(`[signup] Processing registration request from ${fromEmail}`);

  // Rate limit: 3 signup attempts per hour
  const allowed = await checkRateLimit(env, `signup:${fromEmail}`, 3, 3600);
  if (!allowed) {
    await logEmail(env, fromEmail, 'signup@hwmnbn.me', subject, 'signup', 'rate_limited');
    return;
  }

  await logEmail(env, fromEmail, 'signup@hwmnbn.me', subject, 'signup', 'received');

  // Forward to admin for manual review if needed
  if (env.FORWARD_TO) {
    await message.forward(env.FORWARD_TO);
  }

  // Note: Actual signup flow is handled via web API, this is for email-based signups
  // You would parse the email body for signup details and create user here
}

async function handleSignin(env: Env, message: EmailMessage, fromEmail: string, subject: string): Promise<void> {
  console.log(`[signin] Processing login notification for ${fromEmail}`);

  // Rate limit
  const allowed = await checkRateLimit(env, `signin:${fromEmail}`, 10, 3600);
  if (!allowed) {
    await logEmail(env, fromEmail, 'signin@hwmnbn.me', subject, 'signin', 'rate_limited');
    return;
  }

  await logEmail(env, fromEmail, 'signin@hwmnbn.me', subject, 'signin', 'received');

  // Forward to admin
  if (env.FORWARD_TO) {
    await message.forward(env.FORWARD_TO);
  }
}

async function handleNoreply(env: Env, message: EmailMessage, fromEmail: string, subject: string): Promise<void> {
  console.log(`[noreply] Rejecting email from ${fromEmail}`);
  await logEmail(env, fromEmail, 'noreply@hwmnbn.me', subject, 'noreply', 'rejected');

  // Send auto-reply explaining this is not monitored
  try {
    const { html, text } = createNoReplyAutoResponse();
    const reply = createEmailMessage('noreply@hwmnbn.me', fromEmail, 'Re: ' + (subject || 'Your message'), html, text);
    await env.EMAIL.send(reply);
    await logEmail(env, 'noreply@hwmnbn.me', fromEmail, 'Auto-reply', 'noreply', 'auto_replied');
  } catch (e) {
    console.error('Failed to send auto-reply:', e);
  }
}

async function handleSupport(env: Env, message: EmailMessage, fromEmail: string, subject: string): Promise<void> {
  console.log(`[support] Processing support request from ${fromEmail}`);

  const allowed = await checkRateLimit(env, `support:${fromEmail}`, 10, 3600);
  if (!allowed) {
    await logEmail(env, fromEmail, 'support@hwmnbn.me', subject, 'support', 'rate_limited');
    return;
  }

  await logEmail(env, fromEmail, 'support@hwmnbn.me', subject, 'support', 'received');

  if (env.FORWARD_TO) {
    await message.forward(env.FORWARD_TO);
    await logEmail(env, fromEmail, 'support@hwmnbn.me', subject, 'support', 'forwarded');
  }
}

async function handleGeneric(env: Env, message: EmailMessage, toLocal: string, fromEmail: string, subject: string): Promise<void> {
  console.log(`[${toLocal}] Processing email from ${fromEmail}`);
  await logEmail(env, fromEmail, `${toLocal}@hwmnbn.me`, subject, toLocal, 'received');

  if (env.FORWARD_TO) {
    await message.forward(env.FORWARD_TO);
    await logEmail(env, fromEmail, `${toLocal}@hwmnbn.me`, subject, toLocal, 'forwarded');
  }
}

// ============================================
// MAIN HANDLERS
// ============================================

export default {
  // Handle inbound emails
  async email(message: EmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const fromEmail = message.from;
    const toEmail = message.to;
    const toLocal = toEmail.split('@')[0].toLowerCase();

    // Get subject from raw email
    const rawBody = await new Response(message.raw).text();
    const subjectMatch = rawBody.match(/^Subject:\s*(.*)$/mi);
    const subject = subjectMatch ? subjectMatch[1].trim() : '(no subject)';

    console.log(`📧 Received email: ${fromEmail} -> ${toEmail} | Subject: ${subject}`);

    switch (toLocal) {
      case 'noreply':
      case 'no-reply':
        await handleNoreply(env, message, fromEmail, subject);
        break;

      case 'signup':
      case 'sign-up':
      case 'register':
        await handleSignup(env, message, fromEmail, subject);
        break;

      case 'signin':
      case 'sign-in':
      case 'login':
        await handleSignin(env, message, fromEmail, subject);
        break;

      case 'support':
      case 'help':
        await handleSupport(env, message, fromEmail, subject);
        break;

      default:
        await handleGeneric(env, message, toLocal, fromEmail, subject);
    }
  },

  // HTTP API for sending emails programmatically
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Send verification email
    if (url.pathname === '/api/send-verification' && request.method === 'POST') {
      try {
        const body = await request.json() as { email: string; username: string; token: string };
        const verifyUrl = `https://intrepoly.hwmnbn.me/auth/verify?token=${body.token}`;
        const { html, text } = createWelcomeEmail(body.username, verifyUrl);
        const emailMsg = createEmailMessage('noreply@hwmnbn.me', body.email, 'Verify your whoBmonopoly account', html, text);
        await env.EMAIL.send(emailMsg);
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Send magic link email
    if (url.pathname === '/api/send-magic-link' && request.method === 'POST') {
      try {
        const body = await request.json() as { email: string; username: string; magicLinkUrl: string };
        const { html, text } = createMagicLinkEmail(body.username, body.magicLinkUrl);
        const emailMsg = createEmailMessage('signin@hwmnbn.me', body.email, 'Sign in to whoBmonopoly - Magic Link', html, text);
        await env.EMAIL.send(emailMsg);
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Send login notification
    if (url.pathname === '/api/send-login-notification' && request.method === 'POST') {
      try {
        const body = await request.json() as { email: string; username: string; ip: string; userAgent: string };
        const { html, text } = createLoginSuccessEmail(body.username, body.ip, body.userAgent);
        const emailMsg = createEmailMessage('signin@hwmnbn.me', body.email, 'Login successful - whoBmonopoly', html, text);
        await env.EMAIL.send(emailMsg);
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Email stats
    if (url.pathname === '/api/stats' && env.DB) {
      try {
        const stats = await env.DB.prepare(`
          SELECT action, status, COUNT(*) as count
          FROM email_logs
          WHERE created_at > datetime('now', '-24 hours')
          GROUP BY action, status
        `).all();
        return new Response(JSON.stringify({ stats: stats.results }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
      }
    }

    return new Response('whoBmonopoly Email Worker', { status: 200 });
  }
};
