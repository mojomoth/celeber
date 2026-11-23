// 'use client' 컴포넌트: 검색 플로우 (onComplete 콜백으로 결과 반환).
// 다른 PoC 앱이 "@celeber/search-celeb/flow"로 import한다.
// 규칙: 이 폴더 아래 코드는 '@/...' 경로 별칭을 쓰지 말고 상대경로로 import한다.
//       API 호출은 apiBase prop(기본 '')을 앞에 붙여 '/api/celeb/...'로 보낸다.
export { CelebSearchFlow, type CelebSearchFlowProps } from './CelebSearchFlow';
export type { CelebSearchResult } from '../lib/types';
