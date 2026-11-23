// 브라우저/서버 공용 순수 함수. "@celeber/personal-color-report/lib"
// 규칙: '@/...' 경로 별칭 금지(다른 앱이 트랜스파일할 때 깨짐) — 상대경로만 사용.

/** PoC 메타 (호스트 앱이 선행 PoC 링크/API 경로를 만들 때 사용) */
export const POC_INFO = {
  pkg: '@celeber/personal-color-report',
  port: 3105,
  /** 이 PoC의 Route Handler 네임스페이스 */
  apiBase: '/api/report',
} as const;

export * from './classify';
export * from './narrative';
export * from './assemble';
export * from './drape';
export * from './palette';
export * from './api';
