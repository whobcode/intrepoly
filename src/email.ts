/**
 * Email service for sending verification and welcome emails using Cloudflare Email Workers.
 */

// Import EmailMessage as a value from cloudflare:email module
import { EmailMessage } from 'cloudflare:email';

const FROM_EMAIL = 'noreply@hwmnbn.me';
const FROM_NAME = 'whoBmonopoly';

/**
 * Creates a MIME-formatted email message.
 * @param to Recipient email address.
 * @param subject Email subject.
 * @param htmlBody HTML content of the email.
 * @param textBody Plain text content of the email.
 * @returns A properly formatted MIME email string.
 */
function createMimeMessage(to: string, subject: string, htmlBody: string, textBody: string): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  const headers = [
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).substring(2)}@hwmnbn.me>`,
  ].join('\r\n');

  const body = [
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  return headers + '\r\n' + body;
}

/**
 * Sends a verification email to a new user.
 * @param emailBinding The Cloudflare Email binding.
 * @param toEmail The recipient's email address.
 * @param username The user's username.
 * @param verificationToken The verification token.
 * @param baseUrl The base URL for verification links.
 */
export async function sendVerificationEmail(
  emailBinding: any,
  toEmail: string,
  username: string,
  verificationToken: string,
  baseUrl: string
): Promise<void> {
  const verifyUrl = `${baseUrl}/auth/verify?token=${encodeURIComponent(verificationToken)}`;

  const subject = 'Verify your whoBmonopoly account';

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #c32222, #8a1818); color: #fff; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { padding: 30px; }
    .button { display: inline-block; background: linear-gradient(135deg, #ff7a59, #ffc15a); color: #1f2933; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { background: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .code { background: #f5f5f5; padding: 10px 15px; border-radius: 4px; font-family: monospace; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>whoBmonopoly</h1>
    </div>
    <div class="content">
      <h2>Welcome, ${username}!</h2>
      <p>Thanks for signing up for whoBmonopoly! Please verify your email address to get started.</p>
      <p style="text-align: center;">
        <a href="${verifyUrl}" class="button">Verify Email Address</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p class="code">${verifyUrl}</p>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't create an account, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>whoBmonopoly - The Ultimate Multiplayer Monopoly Experience</p>
      <p>This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>`;

  const textBody = `
Welcome to whoBmonopoly, ${username}!

Thanks for signing up! Please verify your email address by clicking the link below:

${verifyUrl}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.

- The whoBmonopoly Team
`;

  try {
    const mimeMessage = createMimeMessage(toEmail, subject, htmlBody, textBody);
    const message = new EmailMessage(FROM_EMAIL, toEmail, mimeMessage);
    await emailBinding.send(message);
    console.log(`Verification email sent to ${toEmail}`);
  } catch (error) {
    console.error(`Failed to send verification email to ${toEmail}:`, error);
    throw error;
  }
}

/**
 * Sends a welcome email after successful verification.
 * @param emailBinding The Cloudflare Email binding.
 * @param toEmail The recipient's email address.
 * @param username The user's username.
 * @param baseUrl The base URL for the game.
 */
export async function sendWelcomeEmail(
  emailBinding: any,
  toEmail: string,
  username: string,
  baseUrl: string
): Promise<void> {
  const lobbyUrl = `${baseUrl}/lobby.html`;

  const subject = 'Welcome to whoBmonopoly!';

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #c32222, #8a1818); color: #fff; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { padding: 30px; }
    .button { display: inline-block; background: linear-gradient(135deg, #ff7a59, #ffc15a); color: #1f2933; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { background: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .feature { padding: 10px 0; border-bottom: 1px solid #eee; }
    .feature:last-child { border-bottom: none; }
    .emoji { font-size: 24px; margin-right: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>whoBmonopoly</h1>
    </div>
    <div class="content">
      <h2>Your email is verified, ${username}!</h2>
      <p>Welcome to whoBmonopoly! Your account is now fully activated and you're ready to play.</p>

      <h3>What you can do now:</h3>
      <div class="feature"><span class="emoji">🎲</span> Play against friends or AI opponents</div>
      <div class="feature"><span class="emoji">💰</span> Buy, sell, and trade properties</div>
      <div class="feature"><span class="emoji">🏠</span> Build houses and hotels</div>
      <div class="feature"><span class="emoji">🤖</span> Get AI-powered strategy advice</div>
      <div class="feature"><span class="emoji">💬</span> Chat with other players</div>

      <p style="text-align: center;">
        <a href="${lobbyUrl}" class="button">Start Playing Now</a>
      </p>

      <p>Good luck and have fun!</p>
    </div>
    <div class="footer">
      <p>whoBmonopoly - The Ultimate Multiplayer Monopoly Experience</p>
      <p>This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>`;

  const textBody = `
Welcome to whoBmonopoly, ${username}!

Your email has been verified and your account is now fully activated!

What you can do now:
- Play against friends or AI opponents
- Buy, sell, and trade properties
- Build houses and hotels
- Get AI-powered strategy advice
- Chat with other players

Start playing now: ${lobbyUrl}

Good luck and have fun!

- The whoBmonopoly Team
`;

  try {
    const mimeMessage = createMimeMessage(toEmail, subject, htmlBody, textBody);
    const message = new EmailMessage(FROM_EMAIL, toEmail, mimeMessage);
    await emailBinding.send(message);
    console.log(`Welcome email sent to ${toEmail}`);
  } catch (error) {
    console.error(`Failed to send welcome email to ${toEmail}:`, error);
    throw error;
  }
}
