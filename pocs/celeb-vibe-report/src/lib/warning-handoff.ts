/**
 * 가이드 생성 직후의 경고(AI 폴백 사유 등)를 다음 화면(/guides/[id])으로 넘긴다.
 * URL 쿼리로 넘기면 누구나 링크로 임의 문구를 공식 경고처럼 띄울 수 있어(콘텐츠 스푸핑) sessionStorage로 한 번만 전달한다.
 */
const key = (guideId: string) => `cvr:guide-warning:${guideId}`;

export function stashGuideWarning(guideId: string, warning: string | undefined): void {
  if (!warning) return;
  try {
    sessionStorage.setItem(key(guideId), warning.slice(0, 200));
  } catch {
    // 저장소를 쓸 수 없으면 기본 안내만 보인다
  }
}

/** 한 번 읽으면 지운다 */
export function takeGuideWarning(guideId: string): string | undefined {
  try {
    const v = sessionStorage.getItem(key(guideId));
    if (v !== null) sessionStorage.removeItem(key(guideId));
    return v ?? undefined;
  } catch {
    return undefined;
  }
}
