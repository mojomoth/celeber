// 브라우저/서버 공용 순수 함수. "@celeber/celeb-vibe/lib"
// 규칙: '@/...' 경로 별칭 금지(다른 앱이 트랜스파일할 때 깨짐) — 상대경로만 사용.

/** PoC 메타 (호스트 앱이 선행 PoC 링크/API 경로를 만들 때 사용) */
export const POC_INFO = {
  pkg: '@celeber/celeb-vibe',
  port: 3104,
  /** 이 PoC의 Route Handler 네임스페이스 */
  apiBase: '/api/vibe',
} as const;

export * from './measurement';
export * from './kmeans';
export * from './pose';
export * from './analyzability';
export * from './rules';
export * from './ai-schema';
export * from './build';
export * from './summary';
export * from './stats';
