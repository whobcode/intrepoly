/**
 * Represents the data stored in a session token.
 */
export interface Session {
  /** The subject of the session, typically a username or user ID. */
  sub: string;
  /** The timestamp when the session was issued. */
  iat: number;
}

const encoder = new TextEncoder();

/**
 * Generates an HMAC signature for a given string.
 * @param key The crypto key to use for signing.
 * @param data The string to sign.
 * @returns A promise that resolves to the Base64-encoded HMAC signature.
 */
async function hmac(key: CryptoKey, data: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

/**
 * Imports a raw secret string into a CryptoKey for HMAC operations.
 * @param secret The raw secret string.
 * @returns A promise that resolves to a CryptoKey.
 */
async function importKey(secret: string): Promise<CryptoKey> {
  const raw = encoder.encode(secret);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/**
 * Encodes a string into Base64URL format.
 * @param input The string to encode.
 * @returns The Base64URL-encoded string.
 */
function base64url(input: string): string {
  return input.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Signs a session object to create a JWT-like token.
 * @param secret The secret to use for signing.
 * @param session The session object to sign.
 * @returns A promise that resolves to the signed session token.
 */
export async function signSession(secret: string, session: Session): Promise<string> {
  const key = await importKey(secret);
  const payload = base64url(btoa(JSON.stringify(session)));
  const sig = await hmac(key, payload);
  return `${payload}.${base64url(sig)}`;
}

/**
 * Verifies a session token and returns the session object if valid.
 * @param secret The secret to use for verification.
 * @param token The session token to verify.
 * @returns A promise that resolves to the session object if the token is valid, otherwise undefined.
 */
export async function verifySession(secret: string, token: string): Promise<Session | undefined> {
  if (!token) return undefined;
  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return undefined;
  const key = await importKey(secret);
  const expected = await hmac(key, payloadB64);
  if (base64url(expected) !== sigB64) return undefined;
  try {
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const obj = JSON.parse(json) as Session;
    return obj;
  } catch {
    return undefined;
  }
}

/**
 * Generates a `Set-Cookie` header string.
 * @param name The name of the cookie.
 * @param value The value of the cookie.
 * @param opts Options for the cookie, such as `maxAge`.
 * @returns A string formatted for the `Set-Cookie` header.
 */
export function setCookie(name: string, value: string, opts: { maxAge?: number } = {}): string {
  const attrs = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (opts.maxAge) attrs.push(`Max-Age=${opts.maxAge}`);
  return attrs.join('; ');
}

/**
 * Parses a cookie value from a `Cookie` header.
 * @param req The incoming request object.
 * @param name The name of the cookie to retrieve.
 * @returns The value of the cookie if found, otherwise undefined.
 */
export function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('Cookie');
  if (!header) return undefined;
  const m = header.match(new RegExp(`${name}=([^;]+)`));
  return m?.[1];
}

/**
 * Hashes a password using PBKDF2 with SHA-256.
 * @param password The password to hash.
 * @param iterations The number of iterations to use for the key derivation.
 * @returns A promise that resolves to a string containing the hashed password and salt.
 */
export async function hashPassword(password: string, iterations = 150000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, baseKey, 256);
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltB64 = btoa(String.fromCharCode(...salt));
  return `pbkdf2$${iterations}$${saltB64}$${hash}`;
}

/**
 * Verifies a password against a stored hash.
 * @param password The password to verify.
 * @param stored The stored hash string (including salt and iterations).
 * @returns A promise that resolves to `true` if the password is correct, otherwise `false`.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'pbkdf2') return false;
    const iterations = parseInt(iterStr, 10) || 150000;
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, baseKey, 256);
    const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
    return hash === hashB64;
  } catch {
    return false;
  }
}
