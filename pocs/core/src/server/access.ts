/**
 * 로컬 PoC 접근 제어 (서버 전용, 각 앱 proxy.ts와 공개 이미지 라우트에서 사용).
 *
 * PoC 앱에는 로그인이 없다. 그런데 휴대폰 촬영이나 Lens 역검색을 위해 HTTPS 터널로 앱을 열면
 * 얼굴 사진(/api/uploads), 세션·리포트 목록, 삭제 API, 유료 AI 호출 API가 인증 없이 인터넷에 노출된다.
 * 그래서:
 *  1) localhost(127.0.0.1, ::1)로 들어온 요청만 기본 허용한다.
 *     그 밖의 Host(터널 도메인, LAN IP)는 CELEBER_ACCESS_TOKEN을 쿠키·헤더로 제시해야 한다.
 *     (휴대폰에서는 한 번 `?access=<토큰>`으로 열면 쿠키가 설정된다.) CELEBER_ALLOWED_HOSTS로 예외 호스트 지정 가능.
 *  2) Lens에는 앱 전체가 아니라 서명·만료가 있는 단일 이미지 경로(/api/public-image/<id>?exp&sig)만 넘긴다.
 *  3) 상태를 바꾸는 요청(POST/PUT/PATCH/DELETE)은 다른 사이트에서 온 것(Sec-Fetch-Site: cross-site,
 *     또는 Host와 다른 Origin)을 거부한다. text/plain 폼 같은 단순 요청으로 DB 쓰기·AI 호출이 실행되는 localhost CSRF 방지.
 */
import crypto from 'node:crypto';

export const ACCESS_COOKIE = 'celeber_access';
export const ACCESS_HEADER = 'x-celeber-access';
export const PUBLIC_IMAGE_PREFIX = '/api/public-image/';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** 'localhost:3105' / '[::1]:3105' → 'localhost' / '::1' */
export function hostnameOf(hostHeader: string | null | undefined): string {
  if (!hostHeader) return '';
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']'));
  return h.split(':')[0];
}

function allowedHosts(): Set<string> {
  const extra = (process.env.CELEBER_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...LOCAL_HOSTS, ...extra]);
}

export function isLocalHostHeader(hostHeader: string | null | undefined): boolean {
  return allowedHosts().has(hostnameOf(hostHeader));
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      try {
        return decodeURIComponent(v.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type AccessDecision =
  | { ok: true; setCookie?: string; redirectTo?: string }
  | { ok: false; status: 403; code: 'remote_access_denied' | 'cross_site_request'; message: string };

type AccessSettings = { token?: string; requireToken?: boolean; allowQueryToken?: boolean; allowCookieToken?: boolean };

/**
 * 요청 하나에 대한 접근 판정 (순수 함수에 가깝게: 입력은 method, url, 헤더).
 * proxy.ts에서 호출한다.
 */
export function decideAccess(input: { method: string; url: string; headers: Headers }, env: AccessSettings = { token: process.env.CELEBER_ACCESS_TOKEN }): AccessDecision {
  const url = new URL(input.url);
  const host = input.headers.get('host') ?? url.host;
  const method = input.method.toUpperCase();

  // 3) CSRF: 상태 변경 요청은 같은 사이트에서만
  if (UNSAFE_METHODS.has(method)) {
    const site = input.headers.get('sec-fetch-site');
    const origin = input.headers.get('origin');
    let originHost: string | null = null;
    try {
      originHost = origin && origin !== 'null' ? new URL(origin).hostname.toLowerCase() : origin === 'null' ? 'null' : null;
    } catch {
      originHost = 'invalid';
    }
    const sameHost = originHost === null || originHost === hostnameOf(host) || (LOCAL_HOSTS.has(originHost) && LOCAL_HOSTS.has(hostnameOf(host)));
    if (site === 'cross-site' || !sameHost) {
      return { ok: false, status: 403, code: 'cross_site_request', message: '다른 사이트에서 보낸 요청은 처리하지 않습니다.' };
    }
  }

  // 1) localhost는 허용
  if (!env.requireToken && isLocalHostHeader(host)) return { ok: true };

  // 2) 서명된 공개 이미지 경로는 라우트에서 서명을 검증하므로 통과
  if (method === 'GET' && url.pathname.startsWith(PUBLIC_IMAGE_PREFIX)) return { ok: true };

  const token = env.token?.trim();
  if (!token) {
    return {
      ok: false,
      status: 403,
      code: 'remote_access_denied',
      message: '이 PoC는 localhost에서만 열 수 있습니다. 터널·다른 기기에서 열려면 루트 .env에 CELEBER_ACCESS_TOKEN을 설정하고 주소 뒤에 ?access=<토큰>을 붙여 한 번 열어 주세요.',
    };
  }
  const q = env.allowQueryToken === false ? null : url.searchParams.get('access');
  if (q && timingSafeEqualStr(q, token)) {
    url.searchParams.delete('access');
    return {
      ok: true,
      setCookie: `${ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${60 * 60 * 12}`,
      redirectTo: url.pathname + (url.search || ''),
    };
  }
  const presented = input.headers.get(ACCESS_HEADER) ?? (env.allowCookieToken === false ? null : cookieValue(input.headers.get('cookie'), ACCESS_COOKIE));
  if (presented && timingSafeEqualStr(presented, token)) return { ok: true };
  return { ok: false, status: 403, code: 'remote_access_denied', message: '접근 토큰이 없거나 맞지 않습니다. 주소 뒤에 ?access=<CELEBER_ACCESS_TOKEN>을 붙여 열어 주세요.' };
}

/* ------------------------------------------------------------------ 서명된 공개 이미지 URL (Lens 전용) */

function imageSecret(): string {
  const s = process.env.CELEBER_PUBLIC_IMAGE_SECRET?.trim() || process.env.CELEBER_ACCESS_TOKEN?.trim();
  if (s) return s;
  // 설정이 없으면 프로세스마다 임의 비밀값 (재시작하면 이전 URL은 무효. Lens는 즉시 가져가므로 충분)
  const g = globalThis as unknown as { __celeberImageSecret?: string };
  g.__celeberImageSecret ??= crypto.randomBytes(32).toString('hex');
  return g.__celeberImageSecret;
}

function imageSig(uploadId: string, exp: number): string {
  return crypto.createHmac('sha256', imageSecret()).update(`${uploadId}.${exp}`).digest('base64url');
}

/** '/api/public-image/<id>?exp=<unix초>&sig=<hmac>' (기본 10분 유효) */
export function signedPublicImagePath(uploadId: string, ttlSec = 600, nowSec = Math.floor(Date.now() / 1000)): string {
  const exp = nowSec + ttlSec;
  return `${PUBLIC_IMAGE_PREFIX}${encodeURIComponent(uploadId)}?exp=${exp}&sig=${imageSig(uploadId, exp)}`;
}

export function verifyPublicImage(uploadId: string, exp: string | null, sig: string | null, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!exp || !sig || !/^\d{9,12}$/.test(exp)) return false;
  const e = Number(exp);
  if (e < nowSec) return false;
  return timingSafeEqualStr(sig, imageSig(uploadId, e));
}

/**
 * 각 앱 proxy.ts의 본체. 허용이면 undefined(그대로 진행), 아니면 403 JSON 또는 쿠키 설정 후 리디렉트.
 *   // <app>/proxy.ts
 *   import { accessProxy } from '@celeber/core/server/access';
 *   export function proxy(request: Request) { return accessProxy(request); }
 */
export function accessProxy(request: Request, env?: AccessSettings): Response | undefined {
  const d = decideAccess({ method: request.method, url: request.url, headers: request.headers }, env);
  if (d.ok) {
    if (d.setCookie && d.redirectTo) return new Response(null, { status: 307, headers: { Location: d.redirectTo, 'Set-Cookie': d.setCookie } });
    return undefined;
  }
  return Response.json({ error: { code: d.code, message: d.message } }, { status: d.status });
}

/** proxy matcher: 정적 청크·MediaPipe 에셋·BI는 제외 */
export const ACCESS_PROXY_MATCHER = ['/((?!_next/static|_next/image|mediapipe/|bi/|favicon.ico).*)'];
