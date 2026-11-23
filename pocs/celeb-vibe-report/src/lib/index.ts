// 브라우저/서버 공용 순수 함수. "@celeber/celeb-vibe-report/lib"
// 규칙: '@/...' 경로 별칭 금지(다른 앱이 트랜스파일할 때 깨짐) — 상대경로만 사용.

/** PoC 메타 (호스트 앱이 선행 PoC 링크/API 경로를 만들 때 사용) */
export const POC_INFO = {
  pkg: '@celeber/celeb-vibe-report',
  port: 3106,
  /** 이 PoC의 Route Handler 네임스페이스 */
  apiBase: '/api/guide',
} as const;

export * from './types';
export * from './palette-map';
export * from './gaps';
export * from './rules';
export * from './ai';
export * from './recolor';
export * from './api';
export * from './summary';
export * from './josa';
export * from './limits';
export * from './warning-handoff';
export * from './upload-check';
