import { ACCESS_HEADER, decideAccess } from '@celeber/core/server/access';
import { hasSession } from './src/access';

export function proxy(request: Request) {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/health' || pathname === '/access' || pathname === '/api/access') return;

  const token = process.env.CELEBER_ACCESS_TOKEN?.trim();
  const headers = new Headers(request.headers);
  if (token && hasSession(headers.get('cookie'), token)) headers.set(ACCESS_HEADER, token);
  const access = decideAccess({ method: request.method, url: request.url, headers }, {
    token,
    requireToken: process.env.CELEBER_REQUIRE_ACCESS_TOKEN === '1' || process.env.RENDER === 'true' || process.env.VERCEL === '1',
    allowQueryToken: false,
    allowCookieToken: false,
  });
  if (access.ok) return;

  if (request.method === 'GET' && !pathname.startsWith('/api/') && !pathname.startsWith('/muse/api/')) {
    return new Response(null, { status: 307, headers: { Location: new URL('/access', request.url).href, 'Cache-Control': 'no-store' } });
  }
  return Response.json({ error: { code: 'access_denied', message: '이 작업은 접속 코드를 입력한 뒤 이용할 수 있어요.' } }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}

export const config = {
  matcher: ['/((?!_next/static|mediapipe/|bi/|photos/|frame/|favicon.ico).*)'],
};
