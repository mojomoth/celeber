// 브라우저/서버 공용 순수 함수. "@celeber/camera-face/lib"
// 규칙: '@/...' 경로 별칭 금지(다른 앱이 트랜스파일할 때 깨짐) — 상대경로만 사용.

/** PoC 메타 (호스트 앱이 선행 PoC 링크/API 경로를 만들 때 사용) */
export const POC_INFO = {
  pkg: '@celeber/camera-face',
  port: 3101,
  /** 이 PoC의 Route Handler 네임스페이스 */
  apiBase: '/api/face',
} as const;

export * from './mask';
export * from './environment';
export * from './quality';
export * from './geometry';
export * from './profile';
export * from './skin';
export * from './analysis';
export * from './api';
export * from './drape';
