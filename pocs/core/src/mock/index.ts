/**
 * @celeber/core/mock — 키 없는 데모 모드용 결정적 Mock 데이터 생성기 (클라이언트/서버 공용).
 * 같은 seed면 항상 같은 결과. 실존 인물 이름을 쓰지 않는다.
 */
import type { CelebCandidate, CelebImageCategory, NamedColor } from '../contracts';

/** 문자열 → 32비트 해시 (FNV-1a) */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 결정적 난수 생성기 (mulberry32). seed는 숫자 또는 문자열 */
export function seededRandom(seed: number | string): () => number {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pickOne<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** 데모용 가상 인물 (실존 인물 아님) */
export const MOCK_PEOPLE: CelebCandidate[] = [
  { name: '윤하람', nameEn: 'Yoon Haram', description: '배우 (데모 인물)', source: 'mock', score: 0.9, evidence: ['데모 데이터: 키가 없어 가상 인물을 표시합니다.'] },
  { name: '서지온', nameEn: 'Seo Jion', description: '가수 (데모 인물)', source: 'mock', score: 0.7, evidence: ['데모 데이터: 키가 없어 가상 인물을 표시합니다.'] },
  { name: '강이안', nameEn: 'Kang Ian', description: '모델 (데모 인물)', source: 'mock', score: 0.6, evidence: ['데모 데이터: 키가 없어 가상 인물을 표시합니다.'] },
  { name: '민채율', nameEn: 'Min Chaeyul', description: '배우 (데모 인물)', source: 'mock', score: 0.5, evidence: ['데모 데이터: 키가 없어 가상 인물을 표시합니다.'] },
];

/** 이름 검색 Mock: 질의와 부분 일치하는 가상 인물 + 질의 자체를 이름으로 한 후보 */
export function mockNameSearch(query: string): CelebCandidate[] {
  const q = query.trim();
  if (!q) return MOCK_PEOPLE;
  const hits = MOCK_PEOPLE.filter((p) => p.name.includes(q) || p.nameEn?.toLowerCase().includes(q.toLowerCase()));
  const self: CelebCandidate = {
    name: q,
    description: '입력한 이름 (데모 모드: 검증되지 않음)',
    source: 'mock',
    score: 0.5,
    evidence: ['키가 없어 이름 검증 없이 입력값을 후보로 사용합니다.'],
  };
  return hits.length ? hits : [self];
}

const OUTFIT_SETS: Record<CelebImageCategory, { outer?: string; top: string; bottom: string; shoes: string; bg: string }[]> = {
  signature: [
    { outer: '#1F2A44', top: '#F8F6F0', bottom: '#1F2A44', shoes: '#111111', bg: '#E9E4EE' },
    { top: '#6D1F2F', bottom: '#6D1F2F', shoes: '#2B2B2E', bg: '#EFE7E2' },
    { outer: '#111111', top: '#111111', bottom: '#111111', shoes: '#111111', bg: '#E7E1E6' },
  ],
  recent: [
    { outer: '#C19A6B', top: '#EEE8DA', bottom: '#5C4033', shoes: '#3E2C23', bg: '#EFEAE0' },
    { outer: '#91A6BE', top: '#F8F6F0', bottom: '#39455E', shoes: '#F8F6F0', bg: '#E8EDF2' },
    { top: '#A7A0B9', bottom: '#2B2B2E', shoes: '#2B2B2E', bg: '#ECEAF1' },
  ],
  daily: [
    { top: '#D8C3A5', bottom: '#5B7DB1', shoes: '#F8F6F0', bg: '#F1EFEA' },
    { outer: '#8D8259', top: '#F3EBDD', bottom: '#3B3D42', shoes: '#111111', bg: '#EEEDE6' },
    { top: '#F8F6F0', bottom: '#91A6BE', shoes: '#D8C3A5', bg: '#EDF0F3' },
  ],
};

/**
 * 전신 실루엣 SVG (데모 이미지). 2:3 비율, 외부 리소스 없음.
 * 얼굴은 단색 원(이목구비 없음) — 얼굴 분석 대상이 아님을 분명히 한다.
 */
export function mockFigureSvg(opts: {
  outer?: string;
  top: string;
  bottom: string;
  shoes: string;
  bg: string;
  skin?: string;
  hair?: string;
  label?: string;
}): string {
  const skin = opts.skin ?? '#E3BBA6';
  const hair = opts.hair ?? '#2B2426';
  const outer = opts.outer
    ? `<path d="M118 150 L90 160 L78 330 L112 332 L120 240 Z M182 150 L210 160 L222 330 L188 332 L180 240 Z" fill="${opts.outer}"/><rect x="112" y="150" width="76" height="190" rx="10" fill="${opts.outer}"/>`
    : '';
  const label = opts.label ? `<text x="150" y="438" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#625C6A">${escapeXml(opts.label)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" width="600" height="900">
<rect width="300" height="450" fill="${opts.bg}"/>
<ellipse cx="150" cy="430" rx="70" ry="8" fill="#000" opacity="0.08"/>
<circle cx="150" cy="78" r="30" fill="${skin}"/>
<path d="M120 74 Q122 42 150 42 Q178 42 180 74 Q170 56 150 56 Q130 56 120 74 Z" fill="${hair}"/>
<rect x="141" y="104" width="18" height="16" fill="${skin}"/>
<path d="M112 122 Q150 112 188 122 L200 250 L100 250 Z" fill="${opts.top}"/>
<path d="M112 124 L92 230 L104 234 L122 150 Z M188 124 L208 230 L196 234 L178 150 Z" fill="${opts.top}"/>
<path d="M104 248 L196 248 L190 410 L158 410 L150 290 L142 410 L110 410 Z" fill="${opts.bottom}"/>
<rect x="104" y="408" width="40" height="14" rx="6" fill="${opts.shoes}"/>
<rect x="156" y="408" width="40" height="14" rx="6" fill="${opts.shoes}"/>
${outer}
${label}
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch] as string);
}

/** SVG → data URL */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface MockImage {
  category: CelebImageCategory;
  title: string;
  dataUrl: string;
  width: number;
  height: number;
  /** 실루엣에 사용한 색 */
  colors: NamedColor[];
}

/** 인물/카테고리별 결정적 데모 전신 이미지 3장 */
export function mockCelebImages(name: string, category: CelebImageCategory, count = 3): MockImage[] {
  const sets = OUTFIT_SETS[category];
  const rng = seededRandom(`${name}:${category}`);
  const titles: Record<CelebImageCategory, string[]> = {
    signature: ['화보', '시상식', '레드카펫'],
    recent: ['최근 행사', '공항', '브랜드 이벤트'],
    daily: ['일상', '사복', '주말 외출'],
  };
  return Array.from({ length: count }, (_, i) => {
    const s = sets[(i + Math.floor(rng() * sets.length)) % sets.length];
    const t = titles[category][i % 3];
    return {
      category,
      title: `${name} · ${t} (데모 실루엣 · 분석 불가)`,
      dataUrl: svgDataUrl(mockFigureSvg({ ...s, label: `데모 실루엣 · 분석 불가 · ${t}` })),
      width: 600,
      height: 900,
      colors: [s.outer, s.top, s.bottom, s.shoes].filter((x): x is string => !!x).map((hex) => ({ hex, name: '' })),
    };
  });
}
