import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const sessionSeconds = 90 * 24 * 60 * 60;
const storedKey = globalThis as typeof globalThis & { celeberLocalSessionKey?: Buffer };

function isHosted(): boolean {
  return process.env.RENDER === 'true' || process.env.VERCEL === '1';
}

function sessionKey(): string | Buffer | null {
  const secret = process.env.CELEBER_SESSION_SECRET?.trim();
  if (secret && Buffer.byteLength(secret) >= 32) return secret;
  if (isHosted()) return null;
  return storedKey.celeberLocalSessionKey ??= randomBytes(32);
}

function isSecure(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return isHosted() || forwarded === 'https' || new URL(request.url).protocol === 'https:';
}

function cookieName(secure: boolean): string {
  return secure ? '__Host-celeber_browser' : 'celeber_browser';
}

function sign(key: string | Buffer, value: string): string {
  return createHmac('sha256', key).update(`celeber-browser:${value}`).digest('base64url');
}

export function createBrowserCookie(request: Request, now = Date.now()): string | null {
  const key = sessionKey();
  if (!key) return null;

  const secure = isSecure(request);
  const id = randomBytes(32).toString('base64url');
  const expires = Math.floor(now / 1000) + sessionSeconds;
  const value = `v1.${id}.${expires}`;
  return `${cookieName(secure)}=${value}.${sign(key, value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionSeconds}${secure ? '; Secure' : ''}`;
}

export function readSessionId(request: Request, now = Date.now()): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  const name = `${cookieName(isSecure(request))}=`;
  const value = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(name))?.slice(name.length);
  const match = value?.match(/^v1\.([A-Za-z0-9_-]{43})\.(\d{9,12})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return null;

  const [, id, expires, mac] = match;
  if (Number(expires) <= Math.floor(now / 1000)) return null;
  const key = sessionKey();
  if (!key) return null;
  return timingSafeEqual(Buffer.from(mac), Buffer.from(sign(key, `v1.${id}.${expires}`))) ? id : null;
}

const readMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSameOriginWrite(request: Request): boolean {
  if (readMethods.has(request.method)) return true;
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site' || site === 'same-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('host') ?? new URL(request.url).host;
  try {
    return new URL(origin).origin === new URL(`${isSecure(request) ? 'https' : 'http'}://${host}`).origin;
  } catch {
    return false;
  }
}
