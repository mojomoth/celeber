/**
 * 팔레트 데이터 (후행 celeb-vibe-report가 코디 치환·갭 계산에 사용).
 * 리포트 한 건에서 "내 팔레트"를 꺼내거나, 톤만으로 같은 형태를 만든다.
 */
import { type Metal, type NamedColor, type PersonalColorReport, type Tone, METAL_LABEL_KO } from '@celeber/core/contracts';
import { getToneProfile, nearestInPalette, tonePaletteAll } from '@celeber/core/personal-color';

export interface MyPalette {
  tone: Tone;
  nameKo: string;
  /** 얼굴 주변 베스트 (드레이핑 베스트 + 범용 베스트) */
  best: NamedColor[];
  /** 피할 색 (드레이핑 워스트 + 범용 워스트) */
  worst: NamedColor[];
  tops: NamedColor[];
  outer: NamedColor[];
  point: NamedColor[];
  hair: NamedColor[];
  hairAvoid: NamedColor[];
  metals: Metal[];
  metalLabels: string[];
  avoidMetals: Metal[];
  /** 코디 치환 후보 전체 (중복 제거) */
  all: NamedColor[];
}

const uniq = (xs: NamedColor[]) => {
  const seen = new Set<string>();
  return xs.filter((c) => (seen.has(c.hex.toUpperCase()) ? false : (seen.add(c.hex.toUpperCase()), true)));
};

/** 톤 → 팔레트 */
export function paletteForTone(tone: Tone): MyPalette {
  const p = getToneProfile(tone);
  return {
    tone,
    nameKo: p.nameKo,
    best: uniq([...p.drapeBest, ...p.best]),
    worst: uniq([...p.drapeWorst, ...p.worst]),
    tops: p.tops,
    outer: p.outer,
    point: p.point,
    hair: p.hair.map((h) => h.color),
    hairAvoid: p.hairAvoid,
    metals: p.metals,
    metalLabels: p.metals.map((m) => METAL_LABEL_KO[m]),
    avoidMetals: p.avoidMetals,
    all: tonePaletteAll(tone),
  };
}

/** 저장된 리포트 → 팔레트 (리포트에 실린 색을 우선) */
export function paletteFromReport(r: PersonalColorReport): MyPalette {
  const base = paletteForTone(r.type.tone);
  return {
    ...base,
    best: uniq([...r.draping.best.map((d) => d.color), ...base.best]),
    worst: uniq([...r.draping.worst.map((d) => d.color), ...r.avoidStyles.items.flatMap((a) => a.colors), ...base.worst]),
    tops: r.tops.items.map((i) => i.color),
    outer: r.outer.items.map((i) => i.color),
    point: r.accessories.pointColors.map((i) => i.color),
    hair: r.hair.items.map((h) => h.color),
    hairAvoid: r.hair.avoid,
    metals: r.accessories.metals,
    metalLabels: r.accessories.metals.map((m) => METAL_LABEL_KO[m]),
    avoidMetals: r.accessories.avoidMetals,
  };
}

/** 임의의 색(예: 연예인 코디 색)을 내 팔레트에서 가장 가까운 색으로 바꾼다 */
export function substituteToPalette(hex: string, palette: MyPalette): { color: NamedColor; deltaE: number; keepOriginal: boolean } {
  const near = nearestInPalette(hex, palette.all);
  const toWorst = nearestInPalette(hex, palette.worst).deltaE;
  // 이미 내 팔레트 안이면 원색 유지
  return { ...near, keepOriginal: near.deltaE <= 8 && near.deltaE < toWorst };
}

/** 금속 표시용 색 (⑧ 악세서리 아이콘) */
export const METAL_HEX: Record<Metal, string> = {
  silver: '#C3C7CD',
  'white-gold': '#E4E1D8',
  platinum: '#D8DADD',
  gold: '#D4AF37',
  'rose-gold': '#D9A08D',
  'champagne-gold': '#D9C59B',
  bronze: '#A9713F',
  gunmetal: '#55585E',
  'modern-metal': '#8E939A',
};
