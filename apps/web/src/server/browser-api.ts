import 'server-only';
import { withBrowserDataScope } from '@celeber/core/server/db';
import { jsonError } from '@celeber/core/server/http';
import { isSameOriginWrite, readSessionId } from '../access';
import type { ApiContext } from './api';

function privateResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return response;
}

export function withBrowserApi(handler: (request: Request, context: ApiContext) => Promise<Response>) {
  return async (request: Request, context: ApiContext) => {
    if (!isSameOriginWrite(request)) {
      return privateResponse(jsonError(403, 'cross_site_request', '다른 사이트에서 보낸 요청은 처리하지 않습니다.'));
    }
    const sessionId = readSessionId(request);
    if (!sessionId) {
      return privateResponse(jsonError(401, 'session_required', '페이지를 새로 열어 주세요. 브라우저에서 쿠키를 허용해야 기록을 저장할 수 있어요.'));
    }
    return privateResponse(await withBrowserDataScope(sessionId, () => handler(request, context)));
  };
}
