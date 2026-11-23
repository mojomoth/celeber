/**
 * 측정값 기반 규칙 초안: 코디 아이템(색/위치), 팔레트, 스타일 키워드, 분위기, 퍼스널컬러.
 * - AI가 있으면 이 초안을 근거로 프롬프트에 넣고, AI 결과와 병합한다.
 * - AI가 없으면(Mock) 이 초안이 그대로 결과가 된다 → 같은 사진이면 항상 같은 결과(결정적).
 * 종류·소재·핏처럼 픽셀로 알 수 없는 값은 지어내지 않고 비워 둔다.
 */
import type { NamedColor, OutfitItem, PersonalColorClassification, Tone, VibePersonalColor } from '@celeber/core/contracts';
import { OUTFIT_CATEGORY_LABEL_KO } from '@celeber/core/contracts';
import { type Lab, type Rgb, applyGains, chroma, colorNameKo, deltaE2000, describeColor, gainsToCct, hexToLab, hueAngle, rgbToLab } from '@celeber/core/color';
import { classifyMeasuredColors, getToneProfile, toneSeason } from '@celeber/core/personal-color';
import { mergeClusterSets } from './kmeans';
import type { ColorCluster, MBox, RegionMeasurement, ServerImageStats, VibeMeasurement } from './measurement';

/* ------------------------------------------------------------------ 상수 */

/** 셀럽 사진 gray-world 보정 강도 (배경색 영향이 커서 약하게) */
export const WB_STRENGTH = 0.4;
/** 연예인 사진 퍼스널컬러 신뢰도 상한 (스튜디오 조명·보정 한계) */
export const CELEB_CONFIDENCE_CAP = 0.85;

const named = (hex: string, nameOverride?: string): NamedColor => ({ hex: hex.toUpperCase(), name: nameOverride ?? colorNameKo(hex) });

/* ------------------------------------------------------------------ 코디 */

export interface RuleOutfit {
  items: OutfitItem[];
  /** 팔레트 계산용 의상 클러스터 (픽셀 가중) */
  clusters: ColorCluster[];
  /** 아이템 판별 근거 */
  notes: string[];
}

function regionOf(m: VibeMeasurement, key: RegionMeasurement['key']): RegionMeasurement | undefined {
  return m.regions.find((r) => r.key === key && r.clusters.length > 0);
}

function unionBox(boxes: (MBox | undefined)[]): MBox | undefined {
  const bs = boxes.filter((b): b is MBox => !!b && b.w > 0 && b.h > 0);
  if (!bs.length) return undefined;
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w));
  const y1 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const r3 = (b: MBox): MBox => ({ x: Math.round(b.x * 1000) / 1000, y: Math.round(b.y * 1000) / 1000, w: Math.round(b.w * 1000) / 1000, h: Math.round(b.h * 1000) / 1000 });

function secondary(clusters: ColorCluster[], main: ColorCluster): NamedColor[] | undefined {
  const mainLab = rgbToLab(main.rgb);
  const s = clusters.filter((c) => c !== main && c.share >= 0.18 && deltaE2000(rgbToLab(c.rgb), mainLab) > 12).slice(0, 2);
  return s.length ? s.map((c) => named(c.hex)) : undefined;
}

const RULE_NOTE = '측정색 기준. 종류·소재·핏은 AI 분석에서 채워집니다.';

/** 브라우저 측정 → 아이템 */
export function ruleOutfitFromMeasurement(m: VibeMeasurement): RuleOutfit {
  const items: OutfitItem[] = [];
  const notes: string[] = [];
  const center = regionOf(m, 'torsoCenter');
  const sides = regionOf(m, 'torsoSides');
  const arms = regionOf(m, 'arms');
  const legs = regionOf(m, 'legs');
  const feet = regionOf(m, 'feet');

  const sideSet = mergeClusterSets([sides, arms].filter((r): r is RegionMeasurement => !!r).map((r) => ({ clusters: r.clusters, weight: r.pixelCount })));
  const c0 = center?.clusters[0];
  const s0 = sideSet[0];
  if (c0 && s0 && s0.share >= 0.35 && deltaE2000(rgbToLab(c0.rgb), rgbToLab(s0.rgb)) > 14) {
    const de = deltaE2000(rgbToLab(c0.rgb), rgbToLab(s0.rgb));
    notes.push(`몸통 가운데(${colorNameKo(c0.hex)})와 양옆·소매(${colorNameKo(s0.hex)}) 색이 달라(ΔE ${de.toFixed(1)}) 앞이 열린 아우터로 봤습니다.`);
    const outerBox = unionBox([sides?.box, arms?.box, center?.box]);
    items.push({ category: 'outer', name: '아우터', color: named(s0.hex), secondaryColors: secondary(sideSet, s0), box: outerBox && r3(outerBox), note: RULE_NOTE });
    items.push({ category: 'top', name: '이너 상의', color: named(c0.hex), secondaryColors: center ? secondary(center.clusters, c0) : undefined, box: center?.box && r3(center.box), note: RULE_NOTE });
  } else if (c0 || s0) {
    const main = c0 ?? s0!;
    const all = center?.clusters ?? sideSet;
    const box = unionBox([center?.box, sides?.box]);
    items.push({ category: 'top', name: OUTFIT_CATEGORY_LABEL_KO.top, color: named(main.hex), secondaryColors: secondary(all, main), box: box && r3(box), note: RULE_NOTE });
  }
  if (legs) {
    const l0 = legs.clusters[0];
    items.push({ category: 'bottom', name: OUTFIT_CATEGORY_LABEL_KO.bottom, color: named(l0.hex), secondaryColors: secondary(legs.clusters, l0), box: r3(legs.box), note: RULE_NOTE });
  }
  if (feet) {
    const f0 = feet.clusters[0];
    items.push({ category: 'shoes', name: OUTFIT_CATEGORY_LABEL_KO.shoes, color: named(f0.hex), box: r3(feet.box), note: RULE_NOTE });
  }
  if (!items.length) notes.push('포즈를 찾지 못해 의상 영역을 측정하지 못했습니다.');

  const clusters = mergeClusterSets(m.regions.map((r) => ({ clusters: r.clusters, weight: r.pixelCount })));
  return { items, clusters, notes };
}

/** 서버 통계(측정 없음) → 대략적인 상/하의 */
export function ruleOutfitFromStats(stats: ServerImageStats): RuleOutfit {
  const items: OutfitItem[] = [];
  const u0 = stats.heuristicUpper[0];
  const l0 = stats.heuristicLower[0];
  const note = '사진 중앙 영역 색 기준(포즈 측정 없음). 위치는 대략적입니다.';
  if (u0) items.push({ category: 'top', name: OUTFIT_CATEGORY_LABEL_KO.top, color: named(u0.hex), secondaryColors: secondary(stats.heuristicUpper, u0), box: { x: 0.3, y: 0.28, w: 0.4, h: 0.27 }, note });
  if (l0 && (!u0 || deltaE2000(rgbToLab(u0.rgb), rgbToLab(l0.rgb)) > 6))
    items.push({ category: 'bottom', name: OUTFIT_CATEGORY_LABEL_KO.bottom, color: named(l0.hex), secondaryColors: secondary(stats.heuristicLower, l0), box: { x: 0.32, y: 0.56, w: 0.36, h: 0.32 }, note });
  const clusters = mergeClusterSets([
    { clusters: stats.heuristicUpper, weight: 1 },
    { clusters: stats.heuristicLower, weight: 1 },
  ]);
  return { items, clusters, notes: ['브라우저 측정 없이 사진 중앙 색만으로 추정했습니다.'] };
}

/* ------------------------------------------------------------------ 팔레트 */

export interface Palette {
  main: NamedColor[];
  sub: NamedColor[];
  accent: NamedColor[];
}

/**
 * 주조(가장 넓은 면적) / 보조(그다음) / 포인트(남은 색 중 채도가 가장 높은 색, 없으면 입술색).
 */
export function rulePalette(clusters: ColorCluster[], lipsRgb?: Rgb): Palette {
  const sorted = [...clusters].sort((a, b) => b.share - a.share);
  const main: NamedColor[] = [];
  const sub: NamedColor[] = [];
  const accent: NamedColor[] = [];
  const used = new Set<string>();
  for (const c of sorted) {
    if (main.length === 0 || (main.length < 2 && c.share >= 0.25)) {
      main.push(named(c.hex));
      used.add(c.hex);
    }
  }
  const rest = sorted.filter((c) => !used.has(c.hex));
  // 포인트: 채도 높은 소면적 색
  const chromatic = rest.filter((c) => chroma(rgbToLab(c.rgb)) >= 22 && c.share < 0.3).sort((a, b) => chroma(rgbToLab(b.rgb)) - chroma(rgbToLab(a.rgb)));
  if (chromatic[0]) {
    accent.push(named(chromatic[0].hex));
    used.add(chromatic[0].hex);
  }
  for (const c of rest) {
    if (used.has(c.hex) || sub.length >= 2) continue;
    sub.push(named(c.hex));
    used.add(c.hex);
  }
  if (!accent.length && lipsRgb) {
    const hex = describeColor(lipsRgb).hex;
    accent.push({ hex, name: `${colorNameKo(hex)} (입술)` });
  }
  return { main, sub, accent };
}

/* ------------------------------------------------------------------ 스타일·분위기 */

interface PaletteStats {
  meanL: number;
  meanC: number;
  maxC: number;
  lRange: number;
  warmEarth: boolean;
  pastel: boolean;
  dark: boolean;
  navyWhite: boolean;
}

function paletteStats(colors: NamedColor[]): PaletteStats {
  const labs = colors.map((c) => hexToLab(c.hex));
  if (!labs.length) return { meanL: 50, meanC: 10, maxC: 10, lRange: 0, warmEarth: false, pastel: false, dark: false, navyWhite: false };
  const ls = labs.map((l) => l.l);
  const cs = labs.map((l) => chroma(l));
  const isEarth = (l: Lab) => {
    const h = hueAngle(l);
    const c = chroma(l);
    return h >= 40 && h <= 90 && c >= 12 && c <= 45 && l.l >= 25 && l.l <= 75;
  };
  const isNavy = (l: Lab) => {
    const h = hueAngle(l);
    return l.l < 35 && h >= 240 && h <= 300 && chroma(l) >= 8;
  };
  const isWhite = (l: Lab) => l.l > 85 && chroma(l) < 10;
  return {
    meanL: ls.reduce((s, v) => s + v, 0) / ls.length,
    meanC: cs.reduce((s, v) => s + v, 0) / cs.length,
    maxC: Math.max(...cs),
    lRange: Math.max(...ls) - Math.min(...ls),
    warmEarth: labs.filter(isEarth).length >= Math.max(1, Math.ceil(labs.length / 2)),
    pastel: labs.every((l) => l.l > 72) && cs.some((c) => c > 8 && c < 32),
    dark: ls.reduce((s, v) => s + v, 0) / ls.length < 35,
    navyWhite: labs.some(isNavy) && labs.some(isWhite),
  };
}

/** 팔레트 성질 → 스타일 키워드 (최대 3개) */
export function ruleStyleKeywords(palette: Palette): string[] {
  const s = paletteStats([...palette.main, ...palette.sub]);
  const kw: string[] = [];
  if (s.navyWhite) kw.push('클래식');
  if (s.meanC < 14 && !s.dark) kw.push('미니멀');
  if (s.dark && s.meanC < 18) kw.push('시크');
  if (s.warmEarth) kw.push('내추럴');
  if (s.pastel) kw.push('로맨틱');
  if (s.maxC > 45) kw.push('스트릿');
  if (s.lRange > 45) kw.push('모던');
  if (s.meanC < 14 && s.dark && !kw.includes('미니멀')) kw.push('미니멀');
  if (!kw.length) kw.push('캐주얼');
  return [...new Set(kw)].slice(0, 3);
}

const MOOD_MAP: Record<string, { keywords: string[]; refs: string[]; impression: string }> = {
  클래식: { keywords: ['단정한', '신뢰감'], refs: ['아이비리그 캠퍼스', '올드 머니 테일러링'], impression: '단정하고 믿음직한' },
  미니멀: { keywords: ['차분한', '절제된'], refs: ['화이트 큐브 갤러리', '90년대 미니멀리즘'], impression: '군더더기 없이 차분한' },
  시크: { keywords: ['도회적인', '시크한'], refs: ['도시의 밤 거리', '모노톤 화보'], impression: '도회적이고 시크한' },
  내추럴: { keywords: ['편안한', '따뜻한'], refs: ['주말 교외 카페', '리넨 셔츠의 오후'], impression: '편안하고 따뜻한' },
  로맨틱: { keywords: ['부드러운', '사랑스러운'], refs: ['봄날 플라워 마켓', '파스텔 필름 사진'], impression: '부드럽고 사랑스러운' },
  스트릿: { keywords: ['자유로운', '활동적인'], refs: ['성수동 골목', '스케이트 컬처'], impression: '자유롭고 활동적인' },
  모던: { keywords: ['세련된', '선명한'], refs: ['건축 잡지 화보', '모던 오피스 라운지'], impression: '세련되고 선명한' },
  캐주얼: { keywords: ['친근한', '산뜻한'], refs: ['주말 시내 산책', '데일리 스냅'], impression: '친근하고 산뜻한' },
};

export function ruleMood(styleKeywords: string[], palette: Palette): { keywords: string[]; firstImpression: string; references: string[] } {
  const keywords: string[] = [];
  const references: string[] = [];
  for (const s of styleKeywords) {
    const m = MOOD_MAP[s] ?? MOOD_MAP['캐주얼'];
    keywords.push(...m.keywords);
    references.push(...m.refs);
  }
  const first = MOOD_MAP[styleKeywords[0]] ?? MOOD_MAP['캐주얼'];
  const mainName = palette.main[0]?.name;
  const firstImpression = mainName ? `${mainName} 중심의 ${styleKeywords[0]} 코디로 ${first.impression} 인상을 줍니다.` : `${first.impression} 인상을 줍니다.`;
  return { keywords: [...new Set(keywords)].slice(0, 5), firstImpression, references: [...new Set(references)].slice(0, 4) };
}

export function ruleSilhouette(items: OutfitItem[], framing: string, frameLabel?: string): string {
  const parts: string[] = [];
  const outer = items.find((i) => i.category === 'outer');
  const top = items.find((i) => i.category === 'top');
  const bottom = items.find((i) => i.category === 'bottom');
  if (outer) parts.push('아우터를 걸친 레이어드');
  if (top && bottom) {
    const de = deltaE2000(hexToLab(top.color.hex), hexToLab(bottom.color.hex));
    parts.push(de < 10 ? '상하의 톤을 맞춘 I라인' : '상하의 색을 나눈 투톤 구성');
  } else if (framing !== 'full-body') parts.push('상반신 위주로 보이는 구성');
  if (frameLabel) parts.push(`체형은 ${frameLabel}`);
  return parts.length ? parts.join(', ') : '실루엣을 판별할 수 있는 영역이 부족합니다';
}

export function ruleOutfitSummary(items: OutfitItem[], styleKeywords: string[]): string {
  if (!items.length) return '의상 영역을 찾지 못했습니다.';
  const desc = items.map((i) => `${i.color.name} ${i.name}`).join(', ');
  return `${desc}. ${styleKeywords.join('·')} 쪽 구성입니다.`;
}

export function ruleLookName(styleKeywords: string[], palette: Palette): string {
  const color = palette.main[0]?.name;
  const style = styleKeywords[0] ?? '데일리';
  return color ? `${style} ${color} 룩` : `${style} 룩`;
}

/* ------------------------------------------------------------------ 퍼스널컬러 */

export interface ConfidenceInputs {
  measured: boolean;
  /** 측정 조건이 퍼스널컬러 분석에 적합한지 (분석 가능성 partial) */
  conditionsOk: boolean;
  skinUsed?: number;
  lumaStd?: number;
  faceHeightPx?: number;
  regionSpreadDeltaE?: number;
  classifierMargin?: number;
  /** 규칙 톤과 AI 톤 일치 여부 */
  agreement: true | false | 'season-only' | null;
  hasHair: boolean;
  hasEyes: boolean;
  /** 측정 없이 AI 판단만 있는 경우 AI가 제시한 확신도 0..1 */
  aiConfidence?: number;
  heuristic?: boolean;
}

/** 연예인 사진 퍼스널컬러 신뢰도 (0..1) + 근거. 고정값이 아니라 측정 품질에서 계산한다. */
export function vibeColorConfidence(i: ConfidenceInputs): { score: number; factors: string[] } {
  const f: string[] = [];
  let s: number;
  if (i.measured) {
    s = 0.5;
    f.push('브라우저에서 얼굴 랜드마크로 피부 영역을 직접 측정했습니다.');
    if ((i.skinUsed ?? 0) >= 1500) s += 0.08;
    else {
      s -= 0.06;
      f.push(`피부 샘플이 적습니다(${i.skinUsed ?? 0}px).`);
    }
    if ((i.faceHeightPx ?? 0) < 120) {
      s -= 0.08;
      f.push('얼굴이 작게 찍혀 해상도가 부족합니다.');
    }
    if ((i.lumaStd ?? 0) > 28) {
      s -= 0.06;
      f.push('피부에 그림자·하이라이트가 많습니다.');
    }
    if ((i.regionSpreadDeltaE ?? 0) > 6) {
      s -= 0.06;
      f.push(`부위별 피부색 편차가 큽니다(ΔE ${i.regionSpreadDeltaE?.toFixed(1)}).`);
    }
    if (i.hasHair) s += 0.04;
    if (i.hasEyes) s += 0.03;
    if (!i.hasHair && !i.hasEyes) f.push('헤어·눈동자 색을 측정하지 못해 대비는 추정값입니다.');
    s += Math.min(0.1, (i.classifierMargin ?? 0) * 0.5);
  } else if (i.heuristic) {
    s = 0.18;
    f.push('얼굴 측정 없이 사진의 피부색 유사 픽셀로 추정했습니다(참고용).');
  } else {
    s = 0.3 + 0.25 * Math.max(0, Math.min(1, i.aiConfidence ?? 0.5));
    f.push('측정값 없이 AI가 사진을 보고 판단했습니다.');
  }
  // 측정이 없을 때 비교 대상은 AI가 읽은 색(또는 중앙 픽셀)으로 돌린 규칙 분류라 '측정 기반'이라고 쓰지 않는다
  const basis = i.measured ? '측정 기반 판정' : '색 규칙 추정';
  if (i.agreement === true) {
    s += 0.1;
    f.push(`${basis}과 AI 판단의 톤이 일치합니다.`);
  } else if (i.agreement === 'season-only') {
    s += 0.04;
    f.push(`${basis}과 AI 판단의 계절은 같고 세부 톤은 다릅니다.`);
  } else if (i.agreement === false) {
    s -= 0.1;
    f.push(`${basis}과 AI 판단이 서로 다릅니다.`);
  }
  if (!i.conditionsOk) {
    s = Math.min(s, 0.3);
    f.push('사진 조건(역광·필터·해상도 등) 때문에 참고용으로만 보세요.');
  }
  s = Math.max(0.05, Math.min(CELEB_CONFIDENCE_CAP, s));
  return { score: Math.round(s * 100) / 100, factors: f };
}

export function lightingCaveat(m: VibeMeasurement | undefined, stats: ServerImageStats | undefined): string {
  const parts = ['연예인 사진은 스튜디오 조명, 메이크업, 보정·필터의 영향을 받아 실제 피부색과 다를 수 있습니다.'];
  const cct = m?.scene.cctK;
  if (cct && Number.isFinite(cct)) {
    if (cct < 4500) parts.push(`장면 색온도가 약 ${Math.round(cct / 100) * 100}K로 따뜻한 조명이라 피부가 실제보다 노랗게 보일 수 있습니다.`);
    else if (cct > 7500) parts.push(`장면 색온도가 약 ${Math.round(cct / 100) * 100}K로 차가운 조명이라 피부가 실제보다 푸르게 보일 수 있습니다.`);
    else parts.push(`장면 색온도는 약 ${Math.round(cct / 100) * 100}K로 중립에 가깝습니다.`);
  }
  if (m?.face) parts.push(`피부색은 장면 전체 색 편향을 ${Math.round(WB_STRENGTH * 100)}% 강도로만 보정했습니다.`);
  if (!m && stats) parts.push('브라우저 얼굴 측정이 없어 색 추정 오차가 더 큽니다.');
  return parts.join(' ');
}

const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' } as const;
const UNDERTONE_KO = { warm: '웜', cool: '쿨', neutral: '뉴트럴' } as const;
export const UNDERTONE_HELD_MESSAGE = '언더톤 판정을 보류했습니다';

/**
 * 톤 계절과 언더톤이 정반대면(웜 계절인데 쿨, 쿨 계절인데 웜) 언더톤 판정을 보류하고 신뢰도를 낮춘다.
 * 어두운 사진처럼 피부 색상각이 흔들릴 때 '가을웜 딥 / 언더톤 쿨' 같은 모순 표시를 막는다. 여러 번 적용해도 같다.
 */
export function reconcileUndertone(pc: VibePersonalColor): VibePersonalColor {
  if (!pc.tone || !pc.undertone || pc.undertone === 'neutral') return pc;
  const season = toneSeason(pc.tone);
  const seasonWarm = season === 'spring' || season === 'autumn';
  if (seasonWarm === (pc.undertone === 'warm')) return pc;
  const line = `톤은 ${SEASON_KO[season]}(${seasonWarm ? '웜' : '쿨'}) 계열인데 피부 언더톤은 ${UNDERTONE_KO[pc.undertone]} 쪽으로 읽혀 ${UNDERTONE_HELD_MESSAGE}. 조명이나 노출의 영향일 수 있습니다.`;
  return { ...pc, undertone: undefined, confidence: Math.max(0.05, Math.round((pc.confidence - 0.1) * 100) / 100), evidence: [...pc.evidence, line] };
}

export interface RulePersonalColor {
  pc: VibePersonalColor;
  classification?: PersonalColorClassification;
}

/**
 * 측정값 → 퍼스널컬러 (분류기). 흑백 사진이나 피부 측정 불가면 톤 없음.
 * conditionsOk=false(역광 등)이면 톤은 주되 신뢰도 상한 0.3.
 */
export function rulePersonalColor(m: VibeMeasurement | undefined, stats: ServerImageStats | undefined, conditionsOk: boolean): RulePersonalColor {
  const grayscale = m?.scene.grayscale ?? stats?.grayscale ?? false;
  const caveat = lightingCaveat(m, stats);
  if (grayscale) {
    return { pc: { measured: false, confidence: 0, evidence: ['흑백 사진이라 퍼스널컬러를 추정하지 않았습니다.'], lightingCaveat: caveat } };
  }
  if (m?.face) {
    const gains = { r: m.scene.grayWorldGains.r, g: m.scene.grayWorldGains.g, b: m.scene.grayWorldGains.b };
    const corr = (rgb: Rgb) => applyGains(rgb, gains, WB_STRENGTH);
    const skin = describeColor(corr(m.face.skin.rgb), 'skin');
    const hair = m.face.hair ? describeColor(corr(m.face.hair.rgb)) : undefined;
    const eyes = m.face.eyes ? describeColor(corr(m.face.eyes.rgb)) : undefined;
    const cls = classifyMeasuredColors({ skin: skin.lab, hair: hair?.lab, eyes: eyes?.lab });
    const conf = vibeColorConfidence({
      measured: true,
      conditionsOk,
      skinUsed: m.face.skin.used,
      lumaStd: m.face.skin.lumaStd,
      faceHeightPx: m.face.heightPx,
      regionSpreadDeltaE: m.face.regionSpreadDeltaE,
      classifierMargin: cls.margin,
      agreement: null,
      hasHair: !!hair,
      hasEyes: !!eyes,
    });
    const profile = getToneProfile(cls.tone);
    return {
      classification: cls,
      pc: reconcileUndertone({
        measured: true,
        skin,
        hair,
        eyes,
        season: cls.season,
        tone: cls.tone,
        toneNameKo: profile.nameKo,
        undertone: cls.undertone,
        axes: cls.axes,
        confidence: conf.score,
        evidence: [...cls.evidence, ...conf.factors],
        lightingCaveat: caveat,
      }),
    };
  }
  if (stats?.heuristicSkin) {
    const skin = describeColor(stats.heuristicSkin.rgb, 'skin');
    const cls = classifyMeasuredColors({ skin: skin.lab });
    const conf = vibeColorConfidence({ measured: false, heuristic: true, conditionsOk, agreement: null, hasHair: false, hasEyes: false });
    return {
      classification: cls,
      pc: reconcileUndertone({
        measured: false,
        skin,
        season: cls.season,
        tone: cls.tone,
        toneNameKo: getToneProfile(cls.tone).nameKo,
        undertone: cls.undertone,
        axes: cls.axes,
        confidence: conf.score,
        evidence: [...conf.factors, ...cls.evidence.slice(0, 3)],
        lightingCaveat: caveat,
      }),
    };
  }
  return { pc: { measured: false, confidence: 0, evidence: ['피부색을 측정할 수 있는 얼굴 영역이 없습니다.'], lightingCaveat: caveat } };
}

/** 톤 일치도: 같은 톤 / 같은 계절 / 다름 */
export function toneAgreement(a: Tone | undefined, b: Tone | undefined): true | false | 'season-only' | null {
  if (!a || !b) return null;
  if (a === b) return true;
  if (toneSeason(a) === toneSeason(b)) return 'season-only';
  return false;
}

/** 장면 색온도 (gray-world 게인 → K) */
export function sceneCct(gains: { r: number; g: number; b: number }): number | undefined {
  const k = gainsToCct(gains);
  return Number.isFinite(k) && k > 1000 && k < 25000 ? Math.round(k) : undefined;
}
