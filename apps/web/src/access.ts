import { createHmac, timingSafeEqual } from 'node:crypto';

const sessionCookie = 'celeber_web_session';
const sessionSeconds = 12 * 60 * 60;

function signature(token: string, expiration: string) {
  return createHmac('sha256', token).update(`celeber-web:${expiration}`).digest('base64url');
}

export function createSessionCookie(token: string, now = Date.now()) {
  const expiration = String(Math.floor(now / 1000) + sessionSeconds);
  const value = `${expiration}.${signature(token, expiration)}`;
  return `${sessionCookie}=${value}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${sessionSeconds}`;
}

export function hasSession(cookieHeader: string | null, token: string | undefined, now = Date.now()): boolean {
  if (!cookieHeader || !token) return false;
  const prefix = `${sessionCookie}=`;
  const cookie = cookieHeader.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix));
  const parts = cookie?.slice(prefix.length).match(/^(\d{9,12})\.([\w-]{43})$/);
  if (!parts || Number(parts[1]) <= Math.floor(now / 1000)) return false;
  return timingSafeEqual(Buffer.from(parts[2]), Buffer.from(signature(token, parts[1])));
}
