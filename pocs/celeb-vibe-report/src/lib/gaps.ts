/**
 * 나 ↔ 연예인 추구미 갭 (축별 0..100).
 *  - 색 5축: 내 리포트 classification.axes(측정) vs 연예인 사진 personalColor.axes.
 *    연예인 값의 출처(celebAxes basis)가 측정이 아니면 코멘트에 적고, 사진 통계 폴백(신뢰도 < 0.3)이면 비교하지 않는다.
 *    헤어·눈 색이 없으면 대비는 기본값(50)이므로 비교하지 않는다.
 *  - 체형 비율: 등신(headsTall)을 5.5~9 → 0~100으로 환산. 어느 한쪽이라도 측정이 없으면 unavailable.
 *  - 스타일: 키워드 사전으로 '소프트 ↔ 시크' 점수(아래 styleScore).
 */
import type { Gap, GapAxis, PersonalColorReport, VibeAnalysis } from '@celeber/core/contracts';
import { TONE_PROTOTYPES } from '@celeber/core/personal-color';
import { contrastText } from '@celeber/personal-color-report/lib';
import { COLOR_DISTORT_CODES } from './limits';
import type { MyBodyRatios } from './types';

export type ColorAxisKey = 'warmth' | 'value' | 'chroma' | 'contrast' | 'clarity';
export type Axes5 = Record<ColorAxisKey, number>;

export const COLOR_AXES: { axis: ColorAxisKey; label: string; poles: [string, string] }[] = [
  { axis: 'warmth', label: '웜/쿨', poles: ['쿨', '웜'] },
  { axis: 'value', label: '명도', poles: ['어두움', '밝음'] },
  { axis: 'chroma', label: '채도', poles: ['부드러움', '선명함'] },
  { axis: 'contrast', label: '대비', poles: ['낮음', '높음'] },
  { axis: 'clarity', label: '청탁', poles: ['탁함', '맑음'] },
];

/** |갭|이 이보다 작으면 '비슷함' */
export const GAP_SIMILAR = 10;
/** |갭|이 이보다 크면 '큰 차이' (액션·주의 요소로 올린다) */
export const GAP_LARGE = 25;

const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
const r0 = (n: number) => Math.round(n);

/* ------------------------------------------------------------------ 스타일 키워드 */

const SOFT_WORDS = ['부드러', '차분', '내추럴', '자연스러', '편안', '로맨틱', '따뜻', '화사', '친근', '다정', '캐주얼', '포근', '온화', '청순', '러블리', '산뜻', '소프트', '여유', '단아', '빈티지', '코지'];
const SHARP_WORDS = ['시크', '모던', '도시', '강렬', '카리스마', '미니멀', '세련', '선명', '또렷', '지적', '쿨한', '스트릿', '테일러', '날렵', '깔끔', '대담', '엣지', '에지', '파워', '포멀', '절제', '구조적', '샤프'];

/** 키워드 → 0(소프트)..100(시크). 매칭이 없으면 null */
export function styleScore(keywords: string[]): { score: number | null; soft: string[]; sharp: string[] } {
  const soft: string[] = [];
  const sharp: string[] = [];
  for (const raw of keywords) {
    const k = raw.replace(/^#/, '').trim();
    if (!k) continue;
    const isSoft = SOFT_WORDS.some((w) => k.includes(w));
    const isSharp = SHARP_WORDS.some((w) => k.includes(w));
    if (isSoft && !isSharp) soft.push(k);
    else if (isSharp && !isSoft) sharp.push(k);
  }
  const n = soft.length + sharp.length;
  if (!n) return { score: null, soft, sharp };
  return { score: r0(50 + (50 * (sharp.length - soft.length)) / n), soft, sharp };
}

/** 내 리포트에서 스타일 키워드 (이미지 키워드 + 해시태그 + 첫인상) */
export function myStyleKeywords(r: PersonalColorReport): string[] {
  const kw = r.features.rows.find((x) => x.key === 'imageKeywords')?.value ?? '';
  return [...kw.split(/[\/,·]/).map((s) => s.trim()), ...r.firstImpression.hashtags, ...r.firstImpression.bullets].filter(Boolean);
}

export function celebStyleKeywords(v: VibeAnalysis): string[] {
  return [...v.mood.keywords, ...v.outfit.styleKeywords, v.mood.firstImpression].filter(Boolean);
}

/* ------------------------------------------------------------------ 축 출처 */

/** 연예인 색 축을 비교에 쓸 수 있는 최소 신뢰도 (celeb-vibe 통계 폴백은 0.18) */
export const CELEB_AXES_MIN_CONFIDENCE = 0.3;

export type CelebAxesBasis = 'measured' | 'estimated' | 'tone' | 'none';

/**
 * 연예인 색 축의 출처.
 *  - measured : 얼굴 랜드마크로 피부(+헤어/눈)를 측정한 값
 *  - estimated: 측정은 없지만 AI가 사진에서 읽은 피부·헤어 색으로 분류한 값 (신뢰도 0.3 이상)
 *  - tone     : 축은 없고 톤만 있을 때 TONE_PROTOTYPES 기준값
 *  - none     : 비교 불가. 사진 중앙 통계 폴백(measured=false, 신뢰도 0.18)처럼 배경색이 피부로 잡힐 수 있는 값은 쓰지 않는다.
 *               celeb-vibe가 partial.personalColor=false로 판정한 사진도 측정 여부와 관계없이 쓰지 않는다.
 */
export function celebAxes(v: VibeAnalysis): { axes: Axes5 | null; basis: CelebAxesBasis; contrastMeasured: boolean; reason?: string } {
  const pc = v.personalColor;
  const a = pc.axes;
  const contrastMeasured = !!(pc.hair || pc.eyes);
  if (v.analyzability.reasons.some((r) => r.code === 'no-person') || v.analyzability.personCount === 0) {
    return { axes: null, basis: 'none', contrastMeasured: false, reason: '연예인 사진에서 인물을 찾지 못해 피부·헤어 색을 비교하지 않았습니다.' };
  }
  // celeb-vibe가 퍼스널컬러 분석 불가로 판정한 사진(아주 어두움·역광·강한 보정 등)은 측정값이 있어도 실제 색이 아니다
  if (v.analyzability.partial.personalColor === false && v.analyzability.reasons.some((r) => COLOR_DISTORT_CODES.has(r.code))) {
    return { axes: null, basis: 'none', contrastMeasured: false, reason: '연예인 사진의 조명·보정 때문에 피부·헤어 색을 제대로 잴 수 없어 비교하지 않았습니다.' };
  }
  if (v.analyzability.partial.personalColor === false && pc.measured) {
    return { axes: null, basis: 'none', contrastMeasured: false, reason: '연예인 사진에서 피부·헤어 색을 제대로 잴 수 없어 비교하지 않았습니다.' };
  }
  const toAxes = (x: NonNullable<typeof a>): Axes5 => ({ warmth: x.warmth, value: x.value, chroma: x.chroma, contrast: x.contrast, clarity: x.clarity });
  if (a && pc.measured) return { axes: toAxes(a), basis: 'measured', contrastMeasured };
  const usable = pc.confidence >= CELEB_AXES_MIN_CONFIDENCE && v.analyzability.partial.personalColor !== false;
  if (!usable) {
    return {
      axes: null,
      basis: 'none',
      contrastMeasured: false,
      reason: `연예인 사진에서 얼굴 피부색을 측정하지 못해(사진 통계 추정, 신뢰도 ${Math.round(pc.confidence * 100)}%) 비교하지 않았습니다.`,
    };
  }
  if (a) return { axes: toAxes(a), basis: 'estimated', contrastMeasured };
  const t = pc.tone;
  if (t) {
    const p = TONE_PROTOTYPES[t];
    return { axes: { warmth: p[0] * 100, value: p[1] * 100, chroma: p[2] * 100, contrast: p[3] * 100, clarity: p[4] * 100 }, basis: 'tone', contrastMeasured: true };
  }
  return { axes: null, basis: 'none', contrastMeasured: false };
}

/** 내 톤의 권장 대비(0..100, 리포트 ④와 같은 기준). 이 값 미만이면 '낮음~중간' → 얼굴 가까이 강한 대비를 권하지 않는다 */
export const SOFT_CONTRAST_REC_MAX = 60;
export function recommendedContrast(r: PersonalColorReport): number {
  return Math.round(TONE_PROTOTYPES[r.type.tone][3] * 100);
}

/**
 * 연예인 쪽 대비가 높을 때 '대비를 올리라'고 권하면 안 되는 경우: 차이가 크거나 내 리포트 권장 대비가 낮음~중간.
 * 이때는 명도 차를 얼굴에서 먼 곳(하의·신발·가방)에만 두는 포인트 대비로 안내한다(주의 요소와 같은 대안).
 */
export function pointContrastOnly(r: PersonalColorReport, contrastGap: number): boolean {
  return contrastGap > 0 && (contrastGap >= GAP_LARGE || recommendedContrast(r) < SOFT_CONTRAST_REC_MAX);
}

/** 사람 몸에서 나올 수 있는 등신 범위 (camera-body RATIO_BOUNDS와 같은 값) */
const HEADS_TALL_RANGE: [number, number] = [3, 13];
const plausibleHeadsTall = (h: number | undefined): h is number => typeof h === 'number' && Number.isFinite(h) && h >= HEADS_TALL_RANGE[0] && h <= HEADS_TALL_RANGE[1];

/** 등신 → 0..100 */
export function headsTallScore(h: number): number {
  return r0(clamp100(((h - 5.5) / (9 - 5.5)) * 100));
}

/* ------------------------------------------------------------------ 코멘트 */

const ADVICE: Record<ColorAxisKey | 'style' | 'body-ratio', { pos: string; neg: string; same: string; posSoft?: string }> = {
  warmth: {
    pos: '따뜻한 색은 하의·가방처럼 얼굴에서 먼 곳에 두고, 얼굴 주변은 내 팔레트 색으로 바꾸세요.',
    neg: '차가운 색은 얼굴에서 먼 곳에 두고, 상의·스카프는 내 따뜻한 팔레트로 바꾸세요.',
    same: '색온도가 비슷해 룩의 주조색을 그대로 참고해도 됩니다.',
  },
  value: {
    pos: '밝은 톤 상의로 전체 명도를 올리면 비슷한 가벼움이 납니다.',
    neg: '어두운 아우터·하의로 무게감을 더하고, 얼굴 옆은 내 명도에 맞는 색을 두세요.',
    same: '밝기 수준이 비슷해 명도 조합을 그대로 따라 해도 됩니다.',
  },
  chroma: {
    pos: '선명한 색은 소품이나 립처럼 한 곳에만 포인트로 쓰세요.',
    neg: '채도를 한 단계 낮춘 색으로 맞추되, 내 팔레트 안에서 고르세요.',
    same: '채도 감이 비슷해 색의 세기를 그대로 참고해도 됩니다.',
  },
  contrast: {
    pos: '상의와 하의의 명도 차로 대비를 만들되, 얼굴 옆 색은 내 대비 수준을 넘지 않게 하세요.',
    /** pointContrastOnly일 때 */
    posSoft: '명도 차는 하의·신발·가방처럼 얼굴에서 먼 곳에만 두고, 얼굴 옆은 내 대비 수준에 맞춘 한 단계 부드러운 조합으로 입으세요.',
    neg: '톤온톤으로 대비를 줄이면 연예인 룩의 부드러운 인상에 가까워집니다.',
    same: '대비 수준이 비슷해 상하의 명도 조합을 그대로 써도 됩니다.',
  },
  clarity: {
    pos: '회색 기를 뺀 맑은 색을 내 팔레트에서 고르세요.',
    neg: '회색 기가 섞인 차분한 색으로 바꾸면 분위기가 가까워집니다.',
    same: '맑고 탁한 정도가 비슷합니다.',
  },
  style: {
    pos: '직선 재단과 미니멀한 소품으로 시크한 인상을 더하세요.',
    neg: '부드러운 소재와 둥근 실루엣으로 분위기를 맞추세요.',
    same: '스타일 결이 비슷해 아이템 구성을 그대로 참고해도 됩니다.',
  },
  'body-ratio': {
    pos: '하이웨이스트 하의와 하의·신발 같은 색 조합으로 다리선을 길게 보이게 하세요.',
    neg: '상의 길이를 조금 길게 두고 허리선을 낮추면 비율 인상이 비슷해집니다.',
    same: '전신 비율이 비슷해 실루엣을 그대로 따라 해도 됩니다.',
  },
};

export function gapComment(axis: ColorAxisKey | 'style' | 'body-ratio', poles: [string, string], gap: number, opts: { soft?: boolean } = {}): string {
  const a = ADVICE[axis];
  if (Math.abs(gap) < GAP_SIMILAR) return a.same;
  const dir = gap > 0 ? poles[1] : poles[0];
  const pos = opts.soft && a.posSoft ? a.posSoft : a.pos;
  return `연예인 쪽이 ${dir} 쪽으로 ${Math.abs(r0(gap))}만큼 떨어져 있습니다. ${gap > 0 ? pos : a.neg}`;
}

/* ------------------------------------------------------------------ 계산 */

/**
 * 저장된 가이드의 색 갭을 지금 규칙으로 다시 거른다 (화면용). 연예인 사진이 지금 기준으로 색 비교 불가
 * (인물 없음·조명·보정 등)인데 예전에 저장한 가이드에 색 갭 값이 남아 있으면 '비교 불가'로 바꿔 그린다.
 */
export function gapsForDisplay(gaps: Gap[], v: VibeAnalysis | null | undefined): Gap[] {
  if (!v) return gaps;
  const c = celebAxes(v);
  if (c.axes) return gaps;
  const color = new Set<string>(COLOR_AXES.map((a) => a.axis));
  return gaps.map((g) =>
    color.has(g.axis) && !g.unavailable ? { ...g, celeb: g.me, gap: 0, comment: c.reason ?? '연예인 사진에서 피부·헤어 색을 측정하지 못해 비교하지 않았습니다.', unavailable: true } : g,
  );
}

export function computeGaps(r: PersonalColorReport, v: VibeAnalysis, myBody?: MyBodyRatios | null): Gap[] {
  const me = r.classification.axes;
  const c = celebAxes(v);
  const gaps: Gap[] = [];
  for (const { axis, label, poles } of COLOR_AXES) {
    const m = r0(clamp100(me[axis]));
    if (!c.axes) {
      gaps.push({ axis, label, me: m, celeb: m, gap: 0, poles, comment: c.reason ?? '연예인 사진에서 피부·헤어 색을 측정하지 못해 비교하지 않았습니다.', unavailable: true });
      continue;
    }
    if (axis === 'contrast' && !c.contrastMeasured) {
      gaps.push({ axis, label, me: m, celeb: m, gap: 0, poles, comment: '연예인 사진에서 헤어·눈동자 색을 측정하지 못해 대비는 비교하지 않았습니다.', unavailable: true });
      continue;
    }
    const ce = r0(clamp100(c.axes[axis]));
    const gap = ce - m;
    const basisNote = c.basis === 'tone' ? ' (연예인 값은 추정 톤 기준값)' : c.basis === 'estimated' ? ' (연예인 값은 AI가 사진에서 읽은 색 기준 추정)' : '';
    // 대비: 측정값(피부·헤어 명도 차)은 검은 머리에서 높게 나오므로 리포트 ④의 권장 대비를 함께 적는다
    const rec = axis === 'contrast' ? ` 내 리포트 권장 대비: ${contrastText(r.classification, r.type.tone).split(' · ')[0]}.` : '';
    const soft = axis === 'contrast' && pointContrastOnly(r, gap);
    gaps.push({ axis, label, me: m, celeb: ce, gap, poles, comment: gapComment(axis, poles, gap, { soft }) + basisNote + rec });
  }

  // 체형 비율
  // 범위를 벗어난 측정값(저장된 거대값 등)은 측정하지 않은 것으로 본다
  const myRaw = myBody?.headsTall;
  const ceRaw = v.body?.measured ? v.body.headsTall : undefined;
  const myH = plausibleHeadsTall(myRaw) ? myRaw : undefined;
  const ceH = plausibleHeadsTall(ceRaw) ? ceRaw : undefined;
  const bodyPoles: [string, string] = ['짧은 비율', '긴 비율'];
  if (myH && ceH) {
    const m = headsTallScore(myH);
    const ce = headsTallScore(ceH);
    const gap = ce - m;
    gaps.push({
      axis: 'body-ratio' satisfies GapAxis,
      label: '체형 비율',
      me: m,
      celeb: ce,
      gap,
      poles: bodyPoles,
      comment: `등신 ${myH.toFixed(1)} → ${ceH.toFixed(1)}. ${gapComment('body-ratio', bodyPoles, gap)}`,
    });
  } else {
    gaps.push({
      axis: 'body-ratio',
      label: '체형 비율',
      me: 50,
      celeb: 50,
      gap: 0,
      poles: bodyPoles,
      comment: !myH
        ? myRaw !== undefined
          ? '내 전신 측정값이 사람 비율 범위를 벗어나 비교하지 않았습니다. 전신 사진을 다시 분석해 주세요.'
          : '내 전신 측정이 없어 비교하지 않았습니다. 퍼스널컬러 리포트에 전신 사진을 추가하면 볼 수 있습니다.'
        : ceRaw !== undefined
          ? '연예인 사진의 전신 비율 측정값이 사람 비율 범위를 벗어나 비교하지 않았습니다.'
          : '연예인 사진에서 전신 비율을 측정하지 못했습니다.',
      unavailable: true,
    });
  }

  // 스타일 키워드
  const ms = styleScore(myStyleKeywords(r));
  const cs = styleScore(celebStyleKeywords(v));
  const stylePoles: [string, string] = ['소프트', '시크'];
  const noPerson = v.analyzability.reasons.some((x) => x.code === 'no-person') || v.analyzability.personCount === 0;
  if (noPerson) {
    // 인물이 없는 사진의 스타일 키워드는 사진 색에서 만든 것이라 연예인 스타일로 비교하지 않는다
    gaps.push({ axis: 'style', label: '스타일', me: ms.score ?? 50, celeb: 50, gap: 0, poles: stylePoles, comment: '연예인 사진에서 인물을 찾지 못해 스타일은 비교하지 않았습니다.', unavailable: true });
  } else if (ms.score === null || cs.score === null) {
    // 한쪽이라도 키워드가 없으면 가정값(50)과 비교하지 않는다
    const comment =
      ms.score === null && cs.score === null
        ? '키워드로 스타일 결을 판단할 수 없었습니다.'
        : ms.score === null
          ? '내 리포트의 이미지 키워드로 스타일 결을 판단할 수 없어 비교하지 않았습니다.'
          : '연예인 룩의 분위기·스타일 키워드로 스타일 결을 판단할 수 없어 비교하지 않았습니다.';
    gaps.push({ axis: 'style', label: '스타일', me: ms.score ?? 50, celeb: cs.score ?? 50, gap: 0, poles: stylePoles, comment, unavailable: true });
  } else {
    const m = ms.score;
    const ce = cs.score;
    const gap = ce - m;
    const words = [...cs.sharp, ...cs.soft].slice(0, 3);
    gaps.push({
      axis: 'style',
      label: '스타일',
      me: m,
      celeb: ce,
      gap,
      poles: stylePoles,
      comment: `${words.length ? `연예인 룩 키워드: ${words.join(', ')}. ` : ''}${gapComment('style', stylePoles, gap)}`,
    });
  }
  return gaps;
}

/** 큰 갭 순 정렬 (비교 가능한 것만) */
export function largestGaps(gaps: Gap[], n = 3): Gap[] {
  return gaps
    .filter((g) => !g.unavailable && Math.abs(g.gap) >= GAP_SIMILAR)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, n);
}
