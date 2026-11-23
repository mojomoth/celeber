/**
 * 리포트/가이드 조립 보조: 성별 변형 라벨, 그루밍 템플릿, 신뢰도 계산, 팔레트 매핑, 기본 문구.
 */
import type {
  ConfidenceFactor,
  Gender,
  NamedColor,
  ReportConfidence,
  ReportIcon,
  ReportVariant,
  Tone,
} from '../contracts';
import { clamp, hexToLab } from '../color/convert';
import { deltaE2000 } from '../color/metrics';
import { TONE_PROFILES } from './palettes';

/* ------------------------------------------------------------------ 성별 변형 */

export function reportVariantLabels(gender: Gender): ReportVariant['labels'] {
  if (gender === 'female')
    return {
      tops: '추천 상의·블라우스 색상',
      outer: '추천 아우터·하의 컬러',
      accessories: '스카프·주얼리 & 악세서리',
      pointItem: '스카프 추천',
      grooming: '메이크업·그루밍 제안',
    };
  if (gender === 'male')
    return {
      tops: '추천 셔츠 색상',
      outer: '추천 수트 컬러',
      accessories: '넥타이 & 악세서리',
      pointItem: '넥타이 추천',
      grooming: '그루밍 제안',
    };
  return {
    tops: '추천 상의 색상',
    outer: '추천 아우터·하의 컬러',
    accessories: '포인트 & 악세서리',
    pointItem: '포인트 컬러 추천',
    grooming: '그루밍 제안',
  };
}

export function buildReportVariant(gender: Gender, userSelected: boolean): ReportVariant {
  return { gender, userSelected, labels: reportVariantLabels(gender) };
}

/** 리포트 제목 (레퍼런스: '남성 퍼스널컬러 분석 리포트') */
export function reportTitle(gender: Gender): string {
  return gender === 'male' ? '남성 퍼스널컬러 분석 리포트' : gender === 'female' ? '여성 퍼스널컬러 분석 리포트' : '퍼스널컬러 분석 리포트';
}

/** ⑩ 그루밍 템플릿 (규칙 기반 기본 문구; AI 서술이 있으면 대체) */
export function groomingTemplate(
  tone: Tone,
  gender: Gender,
): { key: string; icon: ReportIcon; label: string; suggestion: string; colors?: NamedColor[] }[] {
  const p = TONE_PROFILES[tone];
  const cool = p.season === 'summer' || p.season === 'winter';
  const muted = tone.endsWith('mute');
  if (gender === 'female') {
    return [
      { key: 'base', icon: 'base', label: '베이스', suggestion: `${p.makeup.base}로 피부 톤을 정돈하세요.` },
      { key: 'lip', icon: 'lip', label: '립', suggestion: `${p.makeup.lip.map((c) => c.name).join(' / ')} 계열이 혈색을 살립니다.`, colors: p.makeup.lip },
      { key: 'eye', icon: 'eye', label: '아이', suggestion: `${p.makeup.eye.map((c) => c.name).join(' / ')} 섀도로 자연스러운 음영을 주세요.`, colors: p.makeup.eye },
      { key: 'cheek', icon: 'cheek', label: '치크', suggestion: `${p.makeup.cheek.map((c) => c.name).join(' / ')}를 광대 위에 얇게 펴 바르세요.`, colors: p.makeup.cheek },
    ];
  }
  return [
    {
      key: 'skin',
      icon: 'skin',
      label: '피부',
      suggestion: cool ? '수분감 있는 세미매트 타입의 톤업 제품을 추천합니다.' : '윤기를 살리는 수분 크림과 자연스러운 톤 보정이 좋습니다.',
    },
    { key: 'brow', icon: 'brow', label: '눈썹', suggestion: muted ? '자연스럽게 결 정리, 너무 진하지 않게.' : '결을 살려 또렷하게, 모양은 일자에 가깝게.' },
    { key: 'beard', icon: 'beard', label: '수염', suggestion: '깔끔한 라인 유지, 2~3일 간격으로 정리하세요.' },
    {
      key: 'fragrance',
      icon: 'fragrance',
      label: '향수',
      suggestion: cool ? '시원한 우디 / 시트러스 계열이 잘 어울림.' : '따뜻한 앰버 / 스파이시 우디 계열이 잘 어울림.',
    },
  ];
}

/* ------------------------------------------------------------------ 신뢰도 */

export interface ConfidenceInputs {
  /** 환경 조명 품질 0..1 (EnvironmentAnalysis.lightingQuality) */
  lightingQuality: number;
  /** 화이트밸런스 보정량 ΔE (SkinColorMeasurement.whiteBalance.deltaE) — 클수록 낮은 점수 */
  whiteBalanceDeltaE: number;
  /** 얼굴 검출/촬영 품질 0..1 (FaceCapture.quality.detectionScore 등) */
  faceDetectionScore: number;
  /** 피부 ROI 간 편차 ΔE (SkinColorMeasurement.regionSpreadDeltaE) */
  skinSpreadDeltaE: number;
  /** 분류기 1·2위 점수 차 (PersonalColorClassification.margin) */
  classifierMargin: number;
  /** 규칙 판정과 AI 판정 일치 여부: true/false, AI 없으면 null */
  ruleAiAgreement: boolean | 'season-only' | null;
  /** 헤어/눈 측정 여부 (대비 신뢰도) */
  hasHair: boolean;
  hasEyes: boolean;
  /**
   * 화이트밸런스 방법 (SkinColorMeasurement.whiteBalance.method). 'none'이면 보정량 ΔE가 0이어도
   * '보정이 필요 없었다'가 아니라 '보정하지 못했다'이므로 최고점을 주지 않는다. 생략하면 보정량만 본다.
   */
  whiteBalanceMethod?: 'none' | 'gray-world' | 'reference-white' | 'cct' | 'combined';
  /** 얼굴 측정 단계가 집계한 피부 측정 신뢰도 0..1 (SkinColorMeasurement.confidence). 있으면 별도 요인으로 반영 */
  skinConfidence?: number;
}

/**
 * 분석 신뢰도(⑭): 실제 측정 품질에서 계산한다. 고정값 금지.
 * 각 요인 0..1 × 가중치 → 0..100 점수, 등급(높음 ≥ 75, 보통 ≥ 50, 낮음).
 */
export function computeReportConfidence(i: ConfidenceInputs): ReportConfidence {
  const f: ConfidenceFactor[] = [];
  f.push({
    key: 'lighting',
    label: '조명 조건',
    score: clamp(i.lightingQuality),
    weight: 0.25,
    detail: i.lightingQuality >= 0.75 ? '조명이 고르고 밝기가 적정합니다.' : i.lightingQuality >= 0.5 ? '조명에 일부 제약이 있습니다.' : '조명 조건이 좋지 않습니다.',
  });
  const byAmount = clamp(1 - i.whiteBalanceDeltaE / 12);
  const wb =
    i.whiteBalanceMethod === 'none'
      ? 0.4
      : i.whiteBalanceMethod === 'reference-white'
        ? Math.max(byAmount, 0.95)
        : byAmount;
  f.push({
    key: 'white-balance',
    label: '화이트밸런스 보정',
    score: wb,
    weight: 0.15,
    detail:
      i.whiteBalanceMethod === 'none'
        ? '기준 색을 찾지 못해 색 보정 없이 원본 색을 사용했습니다.'
        : `${i.whiteBalanceMethod === 'reference-white' ? '흰 종이 기준 보정, ' : ''}보정 전후 피부색 차이 ΔE ${i.whiteBalanceDeltaE.toFixed(1)}${i.whiteBalanceDeltaE > 6 ? ' (보정량 큼)' : ''}`,
  });
  if (typeof i.skinConfidence === 'number') {
    const sc = clamp(i.skinConfidence);
    f.push({
      key: 'skin-measurement',
      label: '피부 측정 품질',
      score: sc,
      weight: 0.1,
      detail: sc >= 0.7 ? '피부 표본이 충분하고 부위별 값이 안정적입니다.' : '피부 표본이 적거나 부위·밝기 편차가 있습니다.',
    });
  }
  f.push({
    key: 'face-detection',
    label: '얼굴 검출·촬영 품질',
    score: clamp(i.faceDetectionScore),
    weight: 0.15,
    detail: i.faceDetectionScore >= 0.8 ? '정면 얼굴이 안정적으로 검출되었습니다.' : '얼굴 각도나 크기가 일부 기준에 못 미칩니다.',
  });
  f.push({
    key: 'skin-uniformity',
    label: '피부 측정 균일도',
    score: clamp(1 - i.skinSpreadDeltaE / 10),
    weight: 0.1,
    detail: `이마·볼·턱 간 색 편차 ΔE ${i.skinSpreadDeltaE.toFixed(1)}`,
  });
  f.push({
    key: 'classifier-margin',
    label: '타입 구분 명확도',
    score: clamp(i.classifierMargin / 0.35),
    weight: 0.15,
    detail: i.classifierMargin >= 0.2 ? '1순위 타입이 뚜렷합니다.' : '보조 타입과 점수가 가깝습니다.',
  });
  if (i.ruleAiAgreement !== null) {
    const s = i.ruleAiAgreement === true ? 1 : i.ruleAiAgreement === 'season-only' ? 0.65 : 0.25;
    f.push({
      key: 'rule-ai-agreement',
      label: '규칙·AI 판정 일치도',
      score: s,
      weight: 0.15,
      detail: i.ruleAiAgreement === true ? '측정 기반 판정과 AI 판정이 일치합니다.' : i.ruleAiAgreement === 'season-only' ? '계절은 일치, 세부 톤은 다릅니다.' : '측정 기반 판정과 AI 판정이 다릅니다.',
    });
  }
  f.push({
    key: 'feature-coverage',
    label: '헤어·눈동자 측정',
    score: (i.hasHair ? 0.5 : 0) + (i.hasEyes ? 0.5 : 0),
    weight: 0.05,
    detail: [i.hasHair ? '헤어 측정' : '헤어 미측정', i.hasEyes ? '눈동자 측정' : '눈동자 미측정'].join(' · '),
  });

  const wsum = f.reduce((s, x) => s + x.weight, 0);
  const score = Math.round((f.reduce((s, x) => s + x.score * x.weight, 0) / wsum) * 100);
  const grade = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';
  return {
    score,
    grade,
    gradeLabel: grade === 'high' ? '높은 신뢰도' : grade === 'medium' ? '보통 신뢰도' : '낮은 신뢰도',
    factors: f.map((x) => ({ ...x, weight: Math.round((x.weight / wsum) * 1000) / 1000, score: Math.round(x.score * 100) / 100 })),
  };
}

/* ------------------------------------------------------------------ 팔레트 매핑 */

/** 색 하나를 팔레트에서 가장 가까운 색으로 (ΔE2000) */
export function nearestInPalette(hex: string, palette: NamedColor[]): { color: NamedColor; deltaE: number } {
  const lab = hexToLab(hex);
  let best = palette[0];
  let bestD = Infinity;
  for (const p of palette) {
    const d = deltaE2000(lab, hexToLab(p.hex));
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { color: best, deltaE: Math.round(bestD * 10) / 10 };
}

/** 톤의 모든 추천 색 (베스트+상의+아우터+포인트, 중복 제거) — 코디 치환 후보 */
export function tonePaletteAll(tone: Tone): NamedColor[] {
  const p = TONE_PROFILES[tone];
  const seen = new Set<string>();
  return [...p.best, ...p.tops, ...p.outer, ...p.point].filter((c) => (seen.has(c.hex) ? false : (seen.add(c.hex), true)));
}

/** 이 색이 톤의 베스트 영역인지 (가장 가까운 추천색과 ΔE ≤ threshold이고 워스트보다 가까움) */
export function isColorInTone(hex: string, tone: Tone, threshold = 10): boolean {
  const p = TONE_PROFILES[tone];
  const good = nearestInPalette(hex, tonePaletteAll(tone)).deltaE;
  const bad = nearestInPalette(hex, [...p.worst, ...p.drapeWorst]).deltaE;
  return good <= threshold && good < bad;
}

/* ------------------------------------------------------------------ 기본 문구 */

export const DEFAULT_REPORT_SUBTITLE = '업로드한 사진을 기반으로 분석한 결과입니다.';

export const DEFAULT_CAUTIONS = [
  '본 분석은 촬영한 사진의 조명, 카메라 화질, 모니터 환경에 따라 달라질 수 있습니다.',
  '정확한 진단을 위해서는 자연광에서 정면 사진을 여러 장 활용하는 것을 권장합니다.',
  '메이크업, 렌즈, 염색 상태는 측정값에 영향을 줍니다.',
];

export const DEFAULT_DISCLAIMER =
  '※ 본 결과는 업로드한 사진을 기반으로 한 분석 결과이며, 실제 진단은 조명, 화장, 모니터 환경에 따라 달라질 수 있습니다.';
