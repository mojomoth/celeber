/**
 * 결정적 규칙 기반 퍼스널컬러 분류기.
 *
 * 1) 측정값(보정된 피부 Lab, 선택: 헤어/눈 Lab)을 5개 축(0..1)으로 정규화한다.
 *    - warmth  : 피부 hue angle(h_ab)과 b*  (+헤어 hue 소량)
 *    - value   : 피부 L* (+헤어 L* 소량)
 *    - chroma  : 피부 C*ab
 *    - contrast: 피부 L* − (헤어/눈 중 어두운 쪽) L*
 *    - clarity : 채도와 대비, 회색 성분(저채도·중명도)에서 산출
 * 2) 12톤 원형(prototype) 좌표와의 가중 거리 → softmax로 톤 점수.
 * 3) 1위 톤 = 판정, 2위 톤 = '보조 가능 타입'. 1·2위 점수 차 = margin.
 * 같은 입력이면 항상 같은 결과를 낸다(난수 없음).
 */
import type { ColorAxes, PersonalColorClassification, Season, Tone, Undertone } from '../contracts/personal-color';
import { type Lab, chroma as labChroma, clamp, hueAngle } from '../color/convert';
import { TONE_PROFILES } from './palettes';

export interface ClassifierInput {
  /** 화이트밸런스 보정된 피부 Lab (필수) */
  skin: Lab;
  /** 헤어 Lab (있으면 대비/명도/웜 보조) */
  hair?: Lab;
  /** 눈동자 Lab (있으면 대비 보조) */
  eyes?: Lab;
}

/** 축 정규화 기준 (실측 sRGB 피부 분포에 맞춘 경험값). 테스트/튜닝 시 참조. */
export const AXIS_CALIBRATION = {
  /** 피부 hue angle: 45°(핑크·레드 쪽) → 0, 72°(옐로 쪽) → 1 */
  skinHue: { min: 45, max: 72 },
  /** 피부 b*: 9 → 0, 24 → 1 */
  skinB: { min: 9, max: 24 },
  /** 피부 L*: 52 → 0, 82 → 1 */
  skinL: { min: 52, max: 82 },
  /** 피부 C*: 12 → 0, 30 → 1 */
  skinC: { min: 12, max: 30 },
  /** 헤어 L*: 12 → 0, 55 → 1 */
  hairL: { min: 12, max: 55 },
  /** 헤어 hue: 30° → 0, 75° → 1 (저채도면 무시) */
  hairHue: { min: 30, max: 75 },
  /** 피부-어두운 부위 L* 차: 18 → 0, 62 → 1 */
  contrastDL: { min: 18, max: 62 },
  /** 헤어/눈 측정값이 없을 때 대비 기본값 */
  defaultContrast: 0.5,
} as const;

const norm = (v: number, r: { min: number; max: number }) => clamp((v - r.min) / (r.max - r.min));

/**
 * 부호 있는 색상각(-180..180]. b*가 0 아래로 내려가면 h가 358°처럼 360 근처로 튀는데,
 * 그대로 정규화하면 '가장 옐로'로 포화되어 쿨 피부가 웜으로 뒤집힌다. 음수 각으로 바꿔 쿨 쪽에 둔다.
 */
export function signedHueAngle(lab: Lab): number {
  const h = hueAngle(lab);
  return h > 180 ? h - 360 : h;
}

/**
 * 색상각 항의 가중치. 채도(C*)가 3 이하인 거의 회색인 색은 색상각이 잡음이라 0,
 * C* 12 이상이면 최대(0.6). 나머지 가중치는 b*가 받는다.
 */
export function hueWeightForChroma(c: number, max = 0.6): number {
  return max * clamp((c - 3) / 9);
}

type Range = { min: number; max: number };
export type AxisCalibration = {
  skinHue: Range;
  skinB: Range;
  skinL: Range;
  skinC: Range;
  hairL: Range;
  hairHue: Range;
  contrastDL: Range;
  defaultContrast: number;
};
export type TonePrototype = [number, number, number, number, number];

/**
 * 분류기 튜닝 옵션 (앱 단 보정용). core를 고치지 않고 앱에서 실측값에 맞춰 보정할 수 있다.
 * 지정한 키만 덮어쓰고 나머지는 기본값(AXIS_CALIBRATION / TONE_PROTOTYPES / AXIS_WEIGHTS)을 쓴다.
 */
export interface ClassifierOptions {
  calibration?: Partial<AxisCalibration>;
  prototypes?: Partial<Record<Tone, TonePrototype>>;
  weights?: Partial<Record<'warmth' | 'value' | 'chroma' | 'contrast' | 'clarity', number>>;
  /** softmax 온도 (기본 0.06, 작을수록 1위에 확신) */
  softmaxT?: number;
  /** 웜 % 시그모이드 기울기 (기본 9) */
  warmPercentSlope?: number;
}

/** 12톤 원형: [warmth, value, chroma, contrast, clarity] (0..1) */
export const TONE_PROTOTYPES: Record<Tone, TonePrototype> = {
  'spring-light': [0.68, 0.86, 0.5, 0.3, 0.72],
  'spring-bright': [0.7, 0.66, 0.85, 0.62, 0.9],
  'spring-warm': [0.9, 0.66, 0.65, 0.42, 0.72],
  'summer-light': [0.3, 0.86, 0.34, 0.28, 0.6],
  'summer-cool': [0.12, 0.6, 0.42, 0.45, 0.55],
  'summer-mute': [0.36, 0.56, 0.2, 0.32, 0.25],
  'autumn-mute': [0.64, 0.52, 0.24, 0.34, 0.22],
  'autumn-warm': [0.9, 0.46, 0.55, 0.48, 0.42],
  'autumn-deep': [0.7, 0.26, 0.5, 0.66, 0.4],
  'winter-cool': [0.12, 0.48, 0.68, 0.78, 0.8],
  'winter-bright': [0.3, 0.6, 0.9, 0.88, 0.95],
  'winter-deep': [0.3, 0.25, 0.6, 0.86, 0.7],
};
/** 축 가중치: 웜/쿨이 가장 중요 */
export const AXIS_WEIGHTS = { warmth: 1.7, value: 1.0, chroma: 1.0, contrast: 0.8, clarity: 0.6 } as const;
/** softmax 온도 (작을수록 1위에 확신) */
const SOFTMAX_T = 0.06;

export const TONES: Tone[] = Object.keys(TONE_PROTOTYPES) as Tone[];
export const toneSeason = (t: Tone): Season => t.split('-')[0] as Season;

export interface AxesDetail {
  axes01: { warmth: number; value: number; chroma: number; contrast: number; clarity: number };
  contrastEstimated: boolean;
  skinHue: number;
  skinChroma: number;
}

/** 측정값 → 0..1 축 */
export function computeAxes(input: ClassifierInput, calibration?: Partial<AxisCalibration>): AxesDetail {
  const { skin, hair, eyes } = input;
  const C: AxisCalibration = { ...AXIS_CALIBRATION, ...calibration };
  const h = hueAngle(skin);
  const c = labChroma(skin);

  const hueW = hueWeightForChroma(c);
  let warmth = hueW * norm(signedHueAngle(skin), C.skinHue) + (1 - hueW) * norm(skin.b, C.skinB);
  if (hair && labChroma(hair) > 6) warmth = 0.85 * warmth + 0.15 * norm(signedHueAngle(hair), C.hairHue);

  let value = norm(skin.l, C.skinL);
  if (hair) value = 0.75 * value + 0.25 * norm(hair.l, C.hairL);

  const chroma = norm(c, C.skinC);

  const darks = [hair?.l, eyes?.l].filter((v): v is number => typeof v === 'number');
  const contrastEstimated = darks.length === 0;
  const contrast = contrastEstimated ? C.defaultContrast : norm(skin.l - Math.min(...darks), C.contrastDL);

  // 청탁: 채도가 높고 대비가 있으면 맑음, 저채도·중명도면 탁함(회색 성분)
  const grayness = (1 - chroma) * (1 - Math.abs(value - 0.5) * 1.2);
  const clarity = clamp(0.55 * chroma + 0.25 * contrast + 0.2 * (1 - grayness));

  return { axes01: { warmth, value, chroma, contrast, clarity }, contrastEstimated, skinHue: h, skinChroma: c };
}

function toneDistance(a: AxesDetail['axes01'], p: TonePrototype, W: Record<keyof typeof AXIS_WEIGHTS, number>): number {
  return Math.sqrt(
    W.warmth * (a.warmth - p[0]) ** 2 +
      W.value * (a.value - p[1]) ** 2 +
      W.chroma * (a.chroma - p[2]) ** 2 +
      W.contrast * (a.contrast - p[3]) ** 2 +
      W.clarity * (a.clarity - p[4]) ** 2,
  );
}

/** 웜 점수(0..1) → 언더톤 */
export function undertoneOf(warmth01: number): Undertone {
  if (warmth01 >= 0.58) return 'warm';
  if (warmth01 <= 0.42) return 'cool';
  return 'neutral';
}

const pct = (v: number) => Math.round(clamp(v) * 100);

/** 메인 분류 함수 */
export function classifyPersonalColor(input: ClassifierInput, opts: ClassifierOptions = {}): PersonalColorClassification {
  const detail = computeAxes(input, opts.calibration);
  const a = detail.axes01;
  const protos: Record<Tone, TonePrototype> = { ...TONE_PROTOTYPES, ...opts.prototypes } as Record<Tone, TonePrototype>;
  const weights = { ...AXIS_WEIGHTS, ...opts.weights };
  const T = opts.softmaxT ?? SOFTMAX_T;

  const dists = TONES.map((t) => toneDistance(a, protos[t], weights));
  const minD = Math.min(...dists);
  const exps = dists.map((d) => Math.exp(-(d - minD) / T));
  const sum = exps.reduce((s, v) => s + v, 0);
  const scores = exps.map((v) => v / sum);
  const order = TONES.map((t, i) => ({ t, s: scores[i] })).sort((x, y) => y.s - x.s);
  const tone = order[0].t;
  const secondaryTone = order[1].t;
  const margin = order[0].s - order[1].s;

  // 웜 가능성 %: 웜 축을 시그모이드로 완만하게 (0.5 = 50%)
  const warmPercent = Math.round(100 / (1 + Math.exp(-(a.warmth - 0.5) * (opts.warmPercentSlope ?? 9))));

  const axes: ColorAxes = {
    warmth: pct(a.warmth),
    value: pct(a.value),
    chroma: pct(a.chroma),
    contrast: pct(a.contrast),
    clarity: pct(a.clarity),
  };

  const toneScores = Object.fromEntries(TONES.map((t, i) => [t, Math.round(scores[i] * 1000) / 1000])) as Record<Tone, number>;

  return {
    season: toneSeason(tone),
    tone,
    secondaryTone,
    undertone: undertoneOf(a.warmth),
    warmPercent,
    coolPercent: 100 - warmPercent,
    axes,
    toneScores,
    margin: Math.round(margin * 1000) / 1000,
    evidence: buildEvidence(input, detail, tone, protos[tone]),
    inputs: {
      skinLab: round1(input.skin),
      hairLab: input.hair ? round1(input.hair) : undefined,
      eyeLab: input.eyes ? round1(input.eyes) : undefined,
      contrastEstimated: detail.contrastEstimated,
    },
  };
}

const round1 = (l: Lab): Lab => ({ l: Math.round(l.l * 10) / 10, a: Math.round(l.a * 10) / 10, b: Math.round(l.b * 10) / 10 });

/** 축 값(0..100) → 한국어 단계 라벨 */
export function axisLevelLabel(axis: keyof ColorAxes, v: number): string {
  const L = {
    warmth: ['쿨', '뉴트럴 쿨', '뉴트럴', '뉴트럴 웜', '웜'],
    value: ['딥', '중간~딥', '중간', '밝음~중간', '밝음'],
    chroma: ['낮음(뮤트)', '낮음~중간', '중간', '중간~높음', '높음(비비드)'],
    contrast: ['낮음', '낮음~중간', '중간', '중간~높음', '높음'],
    clarity: ['탁함', '약간 탁함', '중간', '약간 맑음', '맑음'],
  } as const;
  const idx = Math.min(4, Math.floor(v / 20));
  return L[axis][idx];
}

function buildEvidence(input: ClassifierInput, d: AxesDetail, tone: Tone, p: TonePrototype): string[] {
  const e: string[] = [];
  const s = input.skin;
  const a = d.axes01;
  const warmWord = a.warmth >= 0.58 ? '노란 기(웜)' : a.warmth <= 0.42 ? '붉은·핑크 기(쿨)' : '중간(뉴트럴)';
  const lowChromaNote = d.skinChroma < 9 ? ' (채도가 낮아 색상각보다 b*를 주로 반영)' : '';
  e.push(`피부 색상각 h ${d.skinHue.toFixed(1)}°, b* ${s.b.toFixed(1)} → ${warmWord} 쪽입니다${lowChromaNote}.`);
  e.push(`피부 명도 L* ${s.l.toFixed(1)} → 명도 ${axisLevelLabel('value', a.value * 100)}.`);
  e.push(`피부 채도 C* ${d.skinChroma.toFixed(1)} → 채도 ${axisLevelLabel('chroma', a.chroma * 100)}.`);
  if (d.contrastEstimated) e.push('헤어·눈동자 색을 측정하지 못해 대비는 중간값으로 가정했습니다.');
  else {
    const darks = [input.hair?.l, input.eyes?.l].filter((v): v is number => typeof v === 'number');
    e.push(`피부와 헤어/눈의 명도 차 ΔL* ${(s.l - Math.min(...darks)).toFixed(1)} → 대비 ${axisLevelLabel('contrast', a.contrast * 100)}.`);
  }
  e.push(
    `측정 축(웜 ${pct(a.warmth)}·명도 ${pct(a.value)}·채도 ${pct(a.chroma)}·대비 ${pct(a.contrast)})이 ${TONE_PROFILES[tone].nameKo} 원형(웜 ${pct(p[0])}·명도 ${pct(p[1])}·채도 ${pct(p[2])}·대비 ${pct(p[3])})에 가장 가깝습니다.`,
  );
  return e;
}
