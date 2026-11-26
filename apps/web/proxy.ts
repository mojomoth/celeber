import { NextResponse } from 'next/server';
import { createBrowserCookie, isSameOriginWrite, readSessionId } from './src/access';

const noStore = { 'Cache-Control': 'private, no-store' };

function isDocumentRequest(request: Request): boolean {
  const destination = request.headers.get('sec-fetch-dest');
  const purpose = request.headers.get('sec-purpose') ?? request.headers.get('purpose');
  return request.method === 'GET' && (destination === null || destination === 'document') && !purpose?.includes('prefetch');
}

export function proxy(request: Request) {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/health') return;

  if (!isSameOriginWrite(request)) {
    return Response.json({ error: { code: 'cross_site_request', message: '다른 사이트에서 보낸 요청은 처리하지 않습니다.' } }, { status: 403, headers: noStore });
  }

  if (readSessionId(request)) return;
  if (pathname === '/api' || pathname.startsWith('/api/') || pathname.startsWith('/muse/api/')) {
    return Response.json({ error: { code: 'session_required', message: '브라우저 쿠키를 허용한 뒤 화면을 새로고침해 주세요.' } }, { status: 401, headers: noStore });
  }

  // 첫 문서에서 발급해 페이지의 병렬 API 요청이 같은 쿠키를 쓰도록 한다.
  if (!isDocumentRequest(request)) return;
  const cookie = createBrowserCookie(request);
  if (!cookie) {
    return Response.json({ error: { code: 'session_unavailable', message: '잠시 뒤 다시 접속해 주세요.' } }, { status: 503, headers: noStore });
  }
  const response = NextResponse.next({ headers: noStore });
  response.headers.append('Set-Cookie', cookie);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|mediapipe/|bi/|photos/|frame/|favicon.ico).*)'],
};
