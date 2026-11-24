// 화면 경로. 화면 컴포넌트는 경로 문자열을 직접 쓰지 말고 ROUTES를 쓴다 (Gate 2 통합 앱에서 바꿔 끼우기 쉽게).
export const ROUTES = {
  landing: '/',
  capture: '/capture',
  analysis: '/analysis',
  personalColor: '/personal-color',
  muse: '/muse',
  library: '/library',
} as const;

export type RouteKey = keyof typeof ROUTES;

// 하단 내비 4칸 (시안 render.py NAV 순서). 탭이 바뀌어도 순서·아이콘 위치는 고정이다.
export const NAV_TABS = [
  { key: 'analysis', label: '내 분석', icon: 'scan', href: ROUTES.analysis },
  { key: 'personalColor', label: '퍼스널컬러', icon: 'palette', href: ROUTES.personalColor },
  { key: 'muse', label: '추구미', icon: 'search', href: ROUTES.muse },
  { key: 'library', label: '내 기록', icon: 'library', href: ROUTES.library },
] as const;

export type NavKey = (typeof NAV_TABS)[number]['key'];
