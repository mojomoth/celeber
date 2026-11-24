/**
 * PoC 레지스트리: 허브 화면, 상태 API, README가 같은 정보를 쓴다.
 * 포트·네임스페이스는 각 앱 package.json의 dev/start 스크립트와 맞아야 한다 (test/pocs.test.ts에서 확인).
 */
export type PocKey = 'camera-face' | 'camera-body' | 'search-celeb' | 'celeb-vibe' | 'personal-color-report' | 'celeb-vibe-report';

export interface PocInfo {
  key: PocKey;
  /** 순서 번호 (POC.md 순서) */
  no: number;
  pkg: `@celeber/${PocKey}`;
  port: number;
  title: string;
  /** 한 줄 설명 */
  summary: string;
  /** 앱이 노출하는 API 네임스페이스 (/api/<ns>/*) */
  apiNamespace: string;
  /** 선행 PoC (이 앱이 flow/routes를 import해서 재사용) */
  requires: PocKey[];
  /** 주요 화면 경로 */
  pages: { path: string; label: string }[];
  /** 스모크 확인용 GET API (200이어야 함) */
  probes: string[];
  /** 외부 기능 의존 (Mock 배지 판단) */
  uses: ('ai' | 'imageSearch' | 'reverseImageSearch')[];
}

export const POCS: PocInfo[] = [
  {
    key: 'camera-face',
    no: 1,
    pkg: '@celeber/camera-face',
    port: 3101,
    title: '얼굴·환경 촬영',
    summary: '환경 → 정면 → 측면을 단계별로 촬영하고 보정한 피부색과 얼굴 윤곽을 뽑는다.',
    apiNamespace: 'face',
    requires: [],
    pages: [
      { path: '/', label: '소개' },
      { path: '/capture', label: '촬영 시작' },
      { path: '/sessions', label: '저장한 세션' },
    ],
    probes: ['/api/health', '/api/face/sessions', '/api/face/latest'],
    uses: ['ai'],
  },
  {
    key: 'camera-body',
    no: 2,
    pkg: '@celeber/camera-body',
    port: 3102,
    title: '전신 비율',
    summary: '전신 사진에서 등신·상하체·어깨/골반 비율을 재고 그림으로 보여 준다.',
    apiNamespace: 'body',
    requires: [],
    pages: [
      { path: '/', label: '소개' },
      { path: '/capture', label: '사진 올리기' },
      { path: '/sessions', label: '저장한 세션' },
    ],
    probes: ['/api/health', '/api/body/sessions'],
    uses: ['ai'],
  },
  {
    key: 'search-celeb',
    no: 3,
    pkg: '@celeber/search-celeb',
    port: 3103,
    title: '연예인 검색',
    summary: '이름(기본) 또는 사진 속 글자·역이미지 검색 결과로 후보를 찾고, 대표·최근·평소 전신 사진을 모은다.',
    apiNamespace: 'celeb',
    requires: [],
    pages: [{ path: '/', label: '인물 찾기' }],
    probes: ['/api/health', '/api/celeb/celebs', '/api/celeb/suggest?q=%EC%9C%A4'],
    uses: ['ai', 'imageSearch', 'reverseImageSearch'],
  },
  {
    key: 'celeb-vibe',
    no: 4,
    pkg: '@celeber/celeb-vibe',
    port: 3104,
    title: '추구미 추출',
    summary: '사진 한 장에서 분석 가능 여부를 먼저 판정하고 코디·퍼스널컬러·분위기를 뽑는다.',
    apiNamespace: 'vibe',
    requires: [],
    pages: [
      { path: '/', label: '사진 분석' },
      { path: '/analyses', label: '분석 기록' },
    ],
    probes: ['/api/health', '/api/vibe/analyses'],
    uses: ['ai'],
  },
  {
    key: 'personal-color-report',
    no: 5,
    pkg: '@celeber/personal-color-report',
    port: 3105,
    title: '퍼스널컬러 리포트',
    summary: '얼굴(필수)·전신(선택) 측정값으로 12톤을 판정하고 레퍼런스 카드 구성의 리포트를 만든다.',
    apiNamespace: 'report',
    requires: ['camera-face', 'camera-body'],
    pages: [
      { path: '/', label: '소개' },
      { path: '/new', label: '리포트 만들기' },
      { path: '/reports', label: '리포트 목록' },
    ],
    probes: ['/api/health', '/api/report/inputs', '/api/report/reports'],
    uses: ['ai'],
  },
  {
    key: 'celeb-vibe-report',
    no: 6,
    pkg: '@celeber/celeb-vibe-report',
    port: 3106,
    title: '추구미 가이드',
    summary: '내 리포트와 연예인 사진 분석을 비교해 갭과 얼굴·코디·분위기 가이드를 만든다.',
    apiNamespace: 'guide',
    requires: ['search-celeb', 'celeb-vibe', 'personal-color-report'],
    pages: [
      { path: '/', label: '소개' },
      { path: '/new', label: '가이드 만들기' },
      { path: '/guides', label: '저장한 가이드' },
    ],
    probes: ['/api/health', '/api/guide/reports', '/api/guide/guides'],
    uses: ['ai', 'imageSearch', 'reverseImageSearch'],
  },
];

export const HUB_PORT = 3100;

/** UI 목업 앱 (pocs/ui/mockup, v4 시안 6화면). API·상태 프로브가 없어 PoC 레지스트리와 따로 둔다. */
export const UI_MOCKUP = { pkg: '@celeber/ui-mockup', dir: 'ui/mockup', port: 3107, title: 'UI 목업', summary: 'v4 시안 6화면을 목업 데이터로 옮긴 앱. 데스크톱에서는 iPhone 프레임 안에 보인다.' } as const;

export function pocByKey(key: PocKey): PocInfo {
  const p = POCS.find((x) => x.key === key);
  if (!p) throw new Error(`unknown poc ${key}`);
  return p;
}

/** 이 PoC를 선행으로 쓰는 PoC들 */
export function dependentsOf(key: PocKey): PocInfo[] {
  return POCS.filter((p) => p.requires.includes(key));
}

/** 요청 Host 헤더에서 호스트 이름만 뽑아 각 PoC 주소를 만든다 (LAN에서 휴대폰으로 열 때도 동작) */
export function pocUrl(p: Pick<PocInfo, 'port'>, host: string | null | undefined, path = '/'): string {
  const hostname = hostnameOf(host);
  return `http://${hostname}:${p.port}${path}`;
}

export function hostnameOf(host: string | null | undefined): string {
  if (!host) return 'localhost';
  // [::1]:3100 → [::1], 192.168.0.2:3100 → 192.168.0.2
  const m = /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(host.trim());
  const h = m?.[1] ?? 'localhost';
  return /^[A-Za-z0-9.\-[\]:]+$/.test(h) ? h : 'localhost';
}
