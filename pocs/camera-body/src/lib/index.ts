// 브라우저/서버 공용 순수 함수. "@celeber/camera-body/lib"
// 규칙: '@/...' 경로 별칭 금지(다른 앱이 트랜스파일할 때 깨짐) — 상대경로만 사용.

/** PoC 메타 (호스트 앱이 선행 PoC 링크/API 경로를 만들 때 사용) */
export const POC_INFO = {
  pkg: '@celeber/camera-body',
  port: 3102,
  /** 이 PoC의 Route Handler 네임스페이스 */
  apiBase: '/api/body',
} as const;

export * from './pose';
export * from './silhouette';
export * from './classify';
export * from './interpret';
export * from './analyze';
export * from './summary';
export * from './outfit';
export * from './demo';
export * from './types';
export * from './framing';
