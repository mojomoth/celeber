// 화면 props 타입. Gate 2 통합 앱은 같은 모양의 실제 분석 결과를 넣는다.

/** 이름 붙은 색. hex는 CSS background 값(그라디언트 허용) */
export type NamedColor = { name: string; hex: string };

export type LandingData = {
  /** 인물 사진 (halo 배경 위에 겹친다) */
  portrait: string;
  logo: string;
  background: string;
  startLabel: string;
};

export type CaptureStep = {
  id: 'environment' | 'front' | 'side' | 'body';
  /** 헤더 제목 */
  title: string;
  /** 촬영 카드에 보일 프리뷰 사진 (목업: 촬영 결과 대신) */
  preview: string;
  /** 위쪽 원형 자세 예시 */
  guide: string;
  optional?: boolean;
};

export type CaptureData = {
  steps: CaptureStep[];
  /** 시작 단계 인덱스 (시안은 2/4 = 1) */
  startIndex: number;
  /** 조명 상태 칩 */
  light: { ok: boolean; items: string[] };
};

export type SelfAnalysisData = {
  photos: { full: string; front: string; side: string };
  /** '11월 23일 촬영 · 자연광 · 밝기 적정' */
  meta: string;
  headline: string[]; // 줄 단위
  summary: string[]; // 줄 단위
  skin: { caption: string; samples: NamedColor[] };
  features: { k: string; v: string }[];
};

export type PersonalColorData = {
  hero: string;
  type: { ko: string[]; en: string; confidence: number; color: string };
  palette: NamedColor[];
  paletteNote: string;
  sliders: { label: string; value: number; ends: [string, string] }[];
  firstImpression: { body: string; tags: string[] };
  warmCool: { warm: number; cool: number };
  drapes: { photo: string; color: NamedColor; good: boolean; note: string }[];
  guide: { k: string; v: string; dots?: string[]; avoid?: boolean }[];
  /** 리포트 가이드 카드의 나머지 섹션 (04 화면 하단). 없으면 그리지 않는다 */
  report?: PersonalColorReport;
};

export type PersonalColorReport = {
  hair: { colors: NamedColor[]; note: string };
  accessories: { colors: NamedColor[]; note: string };
  grooming: { k: string; v: string }[];
  avoid: { color: NamedColor; note: string }[];
  today: string[];
  /** 신뢰도 근거. ok=false는 주의 */
  accuracy: { level: string; factors: { k: string; v: string; ok: boolean }[]; caution: string };
};

export type MuseLook = { id: string; photo: string; title: string; outfit: string; source: string };

export type StyleMuseData = {
  name: string;
  hero: string;
  photoCount: number;
  /** 분석 불가 안내 (올린 사진) */
  rejected: { photo: string; title: string; body: string; badge: string };
  looks: MuseLook[];
  /** 썸네일 띠 (rejected 다음에 구분선) */
  thumbs: string[];
  selectedLookId: string;
  guide: { eyebrow: string; title: string; body: string[] };
  palettes: { who: string; type: string; colors: NamedColor[] }[];
  compare: { photo: string; label: string; title: string; meta: string; bg: string }[];
  points: { k: string; v: string[] }[];
};

export type LibraryData = {
  muses: { id: string; name: string; photo: string; look: string }[];
  sortLabel: string;
  personalColor: { photo: string; type: string; dots: string[]; date: string };
  analysis: { title: string; sub: string };
  reset: { title: string; sub: string; confirmTitle: string; confirmBody: string; confirmLabel: string };
};
