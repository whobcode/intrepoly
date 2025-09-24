export interface Session {
  sub: string; // username or user id
  iat: number;
}

const encoder = new TextEncoder();

async function hmac(key: CryptoKey, data: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

async function importKey(secret: string): Promise<CryptoKey> {
  const raw = encoder.encode(secret);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function base64url(input: string): string {
  return input.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function signSession(secret: string, session: Session): Promise<string> {
  const key = await importKey(secret);
  const payload = base64url(btoa(JSON.stringify(session)));
  const sig = await hmac(key, payload);
  return `${payload}.${base64url(sig)}`;
}

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

export function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('Cookie');
  if (!header) return undefined;
  const m = header.match(new RegExp(`${name}=([^;]+)`));
  return m?.[1];
}

// Password hashing (PBKDF2-SHA256)
export async function hashPassword(password: string, iterations = 150000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, baseKey, 256);
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltB64 = btoa(String.fromCharCode(...salt));
  return `pbkdf2$${iterations}$${saltB64}$${hash}`;
}

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
