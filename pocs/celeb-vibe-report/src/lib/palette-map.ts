/**
 * 연예인 팔레트·코디 색 → 내 퍼스널컬러 팔레트 치환.
 * 내 팔레트는 personal-color-report의 paletteFromReport()를 그대로 쓴다(복제 금지).
 *
 * 규칙
 *  - 얼굴 가까운 아이템(아우터/상의/원피스/모자/안경/액세서리): 내 전체 팔레트와 ΔE2000 ≤ 8이고
 *    워스트보다 팔레트 쪽에 가까우면 원색 유지, 아니면 상의·베스트·아우터·포인트 중 가장 가까운 색으로 바꾼다.
 *  - 얼굴에서 먼 아이템(하의/신발/가방): 워스트 컬러와 ΔE ≥ 10이면 원색 유지(인상 영향이 작음), 아니면 아우터·전체 팔레트로 바꾼다.
 *  - 주얼리: 금속 색으로 보고 내 추천 금속 중 가장 가까운 것으로 맞춘다.
 */
import type { ColorSubstitution, NamedColor, OutfitCategory, OutfitItem, VibeAnalysis } from '@celeber/core/contracts';
import { METAL_LABEL_KO, OUTFIT_CATEGORY_LABEL_KO } from '@celeber/core/contracts';
import { deltaE2000, hexToLab } from '@celeber/core/color';
import { nearestInPalette } from '@celeber/core/personal-color';
import { wj } from './josa';
import { METAL_HEX, type MyPalette, substituteToPalette } from '@celeber/personal-color-report/lib';

/** 얼굴에서 먼 아이템 (원색을 유지해도 얼굴 인상 영향이 작다) */
export const FAR_FROM_FACE: ReadonlySet<OutfitCategory> = new Set(['bottom', 'shoes', 'bag']);
export const METAL_CATEGORIES: ReadonlySet<OutfitCategory> = new Set(['jewelry']);

/** 원색 유지 기준 ΔE2000 */
export const KEEP_DE = 8;
/** 워스트 컬러 근접 기준 ΔE2000 */
export const WORST_NEAR_DE = 10;

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function dE(a: string, b: string): number {
  return round1(deltaE2000(hexToLab(a), hexToLab(b)));
}

const uniqColors = (xs: NamedColor[]) => {
  const seen = new Set<string>();
  return xs.filter((c) => {
    const k = c.hex.toUpperCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** 얼굴 가까운 아이템의 치환 후보 */
export function nearFacePool(p: MyPalette): NamedColor[] {
  return uniqColors([...p.tops, ...p.best, ...p.outer, ...p.point]);
}
/** 얼굴에서 먼 아이템의 치환 후보 */
export function farPool(p: MyPalette): NamedColor[] {
  return uniqColors([...p.outer, ...p.all]);
}
/** 내 추천 금속 → 스와치 색 */
export function metalPool(p: MyPalette): NamedColor[] {
  return p.metals.map((m) => ({ hex: METAL_HEX[m], name: METAL_LABEL_KO[m] }));
}

export interface PaletteMapEntry {
  celeb: NamedColor;
  mine: NamedColor;
  deltaE: number;
}

/** 연예인 룩 팔레트(주조·보조·포인트) → 내 팔레트 매핑 (최대 max개, 중복 제거) */
export function mapCelebPalette(vibe: VibeAnalysis, p: MyPalette, max = 6): PaletteMapEntry[] {
  const colors = uniqColors([...vibe.palette.main, ...vibe.palette.sub, ...vibe.palette.accent]).slice(0, max);
  return colors.map((c) => {
    // 코디 아이템의 색이면 아이템 규칙(얼굴 거리·금속)과 같은 결과를 쓴다
    const item = vibe.outfit.items.find((it) => it.color.hex.toUpperCase() === c.hex.toUpperCase());
    if (item) {
      const sub = substituteItem(item, p);
      return { celeb: c, mine: sub.myColor, deltaE: sub.deltaE };
    }
    const s = substituteToPalette(c.hex, p);
    const mine = s.keepOriginal ? c : s.color;
    return { celeb: c, mine, deltaE: s.keepOriginal ? 0 : dE(c.hex, mine.hex) };
  });
}

/** 아이템 하나의 색 치환 */
export function substituteItem(item: OutfitItem, p: MyPalette): ColorSubstitution {
  const hex = item.color.hex;
  const cat = item.category;
  const itemName = item.name || OUTFIT_CATEGORY_LABEL_KO[cat];
  const toWorst = p.worst.length ? nearestInPalette(hex, p.worst) : { color: item.color, deltaE: 99 };

  if (METAL_CATEGORIES.has(cat)) {
    const pool = metalPool(p);
    const near = pool.length ? nearestInPalette(hex, pool) : { color: item.color, deltaE: 0 };
    const keep = near.deltaE <= 10;
    const labels = p.metalLabels.join(' / ');
    return {
      category: cat,
      itemName,
      celebColor: item.color,
      myColor: keep ? item.color : near.color,
      deltaE: keep ? 0 : near.deltaE,
      keepOriginal: keep,
      reason: keep ? `내 추천 금속(${labels})과 가까워 그대로 써도 됩니다.` : `금속은 ${labels} 쪽이 피부와 잘 맞아 ${wj(near.color.name, '로/으로')} 바꿉니다.`,
    };
  }

  const all = nearestInPalette(hex, p.all);
  if (FAR_FROM_FACE.has(cat)) {
    const keep = toWorst.deltaE >= WORST_NEAR_DE || (all.deltaE <= KEEP_DE && all.deltaE < toWorst.deltaE);
    const near = nearestInPalette(hex, farPool(p));
    return {
      category: cat,
      itemName,
      celebColor: item.color,
      myColor: keep ? item.color : near.color,
      deltaE: keep ? 0 : near.deltaE,
      keepOriginal: keep,
      reason: keep
        ? '얼굴에서 먼 아이템이라 원래 색을 유지해도 인상 변화가 적습니다.'
        : `내 워스트 컬러(${toWorst.color.name})와 가까워 ${wj(near.color.name, '로/으로')} 바꾸면 전체 톤이 맞습니다.`,
    };
  }

  const keep = all.deltaE <= KEEP_DE && all.deltaE < toWorst.deltaE;
  const near = nearestInPalette(hex, nearFacePool(p));
  let reason: string;
  if (keep) reason = `이미 내 팔레트의 ${wj(all.color.name, '와/과')} 가까워 그대로 입어도 됩니다.`;
  else if (toWorst.deltaE < WORST_NEAR_DE) reason = `얼굴 가까이 두면 칙칙해 보일 수 있는 ${toWorst.color.name} 계열이라 ${wj(near.color.name, '로/으로')} 바꿉니다.`;
  else reason = `얼굴 가까이 오는 아이템이라 내 팔레트에서 가장 가까운 ${wj(near.color.name, '로/으로')} 바꿉니다.`;
  return {
    category: cat,
    itemName,
    celebColor: item.color,
    myColor: keep ? item.color : near.color,
    deltaE: keep ? 0 : near.deltaE,
    keepOriginal: keep,
    reason,
  };
}

export function substituteOutfit(vibe: VibeAnalysis, p: MyPalette): ColorSubstitution[] {
  return vibe.outfit.items.map((it) => substituteItem(it, p));
}

/** 치환과 원래 아이템 연결 (사진 위 색 바꾸기 시뮬레이션용 box 찾기) */
export function findItemForSubstitution(items: OutfitItem[], s: ColorSubstitution): OutfitItem | undefined {
  return (
    items.find((it) => it.category === s.category && it.color.hex.toUpperCase() === s.celebColor.hex.toUpperCase() && (it.name || OUTFIT_CATEGORY_LABEL_KO[it.category]) === s.itemName) ??
    items.find((it) => it.category === s.category && it.color.hex.toUpperCase() === s.celebColor.hex.toUpperCase())
  );
}

/** 워스트 근접 여부 (그대로 따라 하면 안 되는 요소 판단) */
export function nearWorst(hex: string, p: MyPalette): { near: boolean; color: NamedColor; deltaE: number } {
  if (!p.worst.length) return { near: false, color: { hex, name: '' }, deltaE: 99 };
  const w = nearestInPalette(hex, p.worst);
  return { near: w.deltaE < WORST_NEAR_DE, color: w.color, deltaE: w.deltaE };
}
