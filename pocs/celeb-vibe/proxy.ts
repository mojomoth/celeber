/**
 * 접근 제어: localhost만 기본 허용, 터널·다른 기기는 CELEBER_ACCESS_TOKEN 필요, 다른 사이트발 상태 변경 요청 거부.
 * 서명된 /api/public-image/<id>(Lens용)만 토큰 없이 통과. 구현은 @celeber/core/server/access.
 */
import { accessProxy } from '@celeber/core/server/access';

export function proxy(request: Request) {
  return accessProxy(request);
}

// 정적 문자열이어야 Next가 빌드 시 분석할 수 있다 (ACCESS_PROXY_MATCHER와 같은 값)
export const config = {
  matcher: ['/((?!_next/static|_next/image|mediapipe/|bi/|favicon.ico).*)'],
};
