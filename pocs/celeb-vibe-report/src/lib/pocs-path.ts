/**
 * '/pocs/celeb-vibe-report/*' 경로 접근: 앱은 루트(/)에서 돌므로 접두어를 떼고 같은 경로로 보낸다.
 * basePath를 쓰면 선행 플로우가 부르는 /api/* 절대 경로가 깨진다. next.config `redirects`는
 * dev(Next 16.4.6)에서 HMR 새로고침이 끝없이 반복돼서 proxy에서 처리한다.
 */
export const POCS_PREFIX = '/pocs/celeb-vibe-report';

export function pocsPathRedirect(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.pathname !== POCS_PREFIX && !url.pathname.startsWith(`${POCS_PREFIX}/`)) return undefined;
  // Next proxy는 절대 URL Location만 받는다. 요청 URL 기준이라 호스트·쿼리는 그대로다.
  url.pathname = url.pathname.slice(POCS_PREFIX.length) || '/';
  return Response.redirect(url, 307);
}
