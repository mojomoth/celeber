/**
 * 체형 분류 (순수 함수).
 * - 골격 프레임 5유형: 어깨/허리/골반 실루엣 폭 비로 소프트 점수 → 정규화.
 * - 골격 진단 3유형(스트레이트/웨이브/내추럴): 2D 사진으로는 뼈 굵기·살의 질감을 볼 수 없어
 *   비율에서 추정한 "참고 분류"이며 신뢰도를 0.45 이하로 제한한다.
 */
import { BODY_FRAME_LABEL_KO, BODY_SKELETON_LABEL_KO, type BodyFrame, type BodySkeletonType } from '@celeber/core/contracts';
import { round2 } from './pose';

export type WidthMethod = 'silhouette' | 'landmarks';

export interface FrameInput {
  /** 어깨 폭 / 골반 폭 */
  shoulderToHip: number;
  /** 허리 폭 / 골반 폭 (실루엣에서만) */
  waistToHip?: number;
  method: WidthMethod;
  /**
   * 측정 불확실도 0..1 (관절점 환산, 팔 겹침 보정, 어깨 폭 상한 적용 등). 클수록 점수를 균등 쪽으로 눌러
   * 경계값 측정이 100%처럼 보이지 않게 한다.
   */
  uncertainty?: number;
  /** 근거에 덧붙일 측정 메모 */
  notes?: string[];
}

/** 점수 완화: 최소 이만큼은 5유형에 균등 분배 (불확실도에 따라 최대 FRAME_BLEND_MAX) */
export const FRAME_BLEND_MIN = 0.1;
export const FRAME_BLEND_MAX = 0.35;

/**
 * 관절점(어깨 관절 사이 / 고관절 사이) 비는 실루엣(바깥 윤곽) 비보다 크게 나온다.
 * 관절점 비를 실루엣 비 근사로 바꾸는 경험 계수 (core로 승격 후보: 실측 데이터로 보정 필요).
 */
export const LANDMARK_TO_SILHOUETTE_SHOULDER_HIP = 1 / 1.3;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const bell = (v: number, mu: number, sd: number) => Math.exp(-0.5 * ((v - mu) / sd) ** 2);

/** 실루엣 기준으로 환산한 어깨/골반 비 */
export function silhouetteEquivalentShoulderHip(i: FrameInput): number {
  return i.method === 'silhouette' ? i.shoulderToHip : i.shoulderToHip * LANDMARK_TO_SILHOUETTE_SHOULDER_HIP;
}

export function classifyFrame(i: FrameInput): { type: BodyFrame; label: string; scores: Record<BodyFrame, number>; evidence: string[] } {
  const r = silhouetteEquivalentShoulderHip(i);
  const hasWaist = i.waistToHip !== undefined && Number.isFinite(i.waistToHip);
  const w = hasWaist ? (i.waistToHip as number) : 0.82;

  const raw: Record<BodyFrame, number> = {
    'inverted-triangle': sigmoid((r - 1.16) / 0.05),
    triangle: sigmoid((0.96 - r) / 0.05),
    hourglass: bell(r, 1.02, 0.07) * sigmoid((0.75 - w) / 0.03),
    // 타원형: 허리가 골반만큼 넓고 어깨와도 비슷(허리/어깨 ≥ 0.9)
    oval: sigmoid((w - 0.94) / 0.025) * sigmoid((w / r - 0.9) / 0.04),
    rectangle: bell(r, 1.05, 0.09) * sigmoid((w - 0.75) / 0.03) * (1 - sigmoid((w - 0.94) / 0.025)),
  };
  // 허리 폭을 모르면 허리 의존 유형(모래시계/타원)의 근거가 약하므로 낮춘다
  if (!hasWaist) {
    raw.hourglass *= 0.4;
    raw.oval *= 0.4;
  }
  const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  // 균등 분포와 섞어 과신을 줄인다 (순위는 바뀌지 않음, 합은 1 유지)
  const u = Math.max(0, Math.min(1, i.uncertainty ?? (i.method === 'landmarks' ? 0.5 : 0)));
  const blend = FRAME_BLEND_MIN + (FRAME_BLEND_MAX - FRAME_BLEND_MIN) * u;
  const n = Object.keys(raw).length;
  const scores = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, round2((1 - blend) * (v / sum) + blend / n)])) as Record<BodyFrame, number>;
  const type = (Object.keys(scores) as BodyFrame[]).reduce((a, b) => (scores[b] > scores[a] ? b : a));

  const evidence: string[] = [];
  const basis = i.method === 'silhouette' ? '실루엣 기준' : '관절점 기준을 실루엣으로 환산';
  evidence.push(`어깨/골반 폭 비 ${r.toFixed(2)} (${basis})${r >= 1.16 ? ': 어깨가 골반보다 넓음' : r <= 0.96 ? ': 골반이 어깨보다 넓음' : ': 어깨와 골반이 비슷함'}`);
  if (hasWaist) {
    evidence.push(`허리/골반 폭 비 ${w.toFixed(2)}${w <= 0.75 ? ': 허리선이 잘록함' : w >= 0.94 ? ': 허리가 골반만큼 넓음' : ': 허리선이 완만함'}`);
  } else {
    evidence.push('허리 폭을 측정하지 못해 허리선 관련 유형(모래시계형/타원형)의 비중을 낮췄습니다.');
  }
  for (const note of i.notes ?? []) evidence.push(note);
  if (u >= 0.3) evidence.push('측정 조건상 오차가 커서 유형 점수를 보수적으로(균등 쪽으로) 표시했습니다.');
  return { type, label: BODY_FRAME_LABEL_KO[type], scores, evidence };
}

export interface SkeletonInput {
  shoulderToHip: number;
  method: WidthMethod;
  waistToHip?: number;
  upperToLower?: number;
  /** 어깨 폭(실루엣 또는 관절) / 키 */
  shoulderToHeight?: number;
}

/** 골격 진단 참고 분류 (신뢰도 ≤ 0.45) */
export function classifySkeleton(i: SkeletonInput): { type: BodySkeletonType; label: string; confidence: number; evidence: string[] } {
  const r = silhouetteEquivalentShoulderHip(i);
  const w = i.waistToHip ?? 0.82;
  const shW = i.shoulderToHeight !== undefined ? (i.method === 'silhouette' ? i.shoulderToHeight : i.shoulderToHeight * 1.17) : 0.25;
  const ul = i.upperToLower ?? 0.95;

  const s = {
    // 상체에 볼륨, 허리선이 높고 완만, 어깨가 넓은 편
    straight: bell(r, 1.15, 0.08) * bell(w, 0.82, 0.07) * (ul <= 1 ? 1 : 0.8),
    // 상체가 얇고 하체 쪽에 무게, 허리가 잘록
    wave: sigmoid((1.05 - r) / 0.05) * sigmoid((0.8 - w) / 0.04),
    // 골격 프레임이 크고(어깨 폭/키 큼) 직선적인 실루엣
    natural: sigmoid((shW - 0.265) / 0.012) * sigmoid((w - 0.78) / 0.04),
  };
  const sum = s.straight + s.wave + s.natural || 1;
  const entries = (Object.keys(s) as BodySkeletonType[]).map((k) => [k, s[k] / sum] as const).sort((a, b) => b[1] - a[1]);
  const [type, p] = entries[0];
  const margin = p - entries[1][1];
  const confidence = round2(Math.min(0.45, 0.2 + margin * 0.5));
  const evidence: string[] = [];
  if (type === 'straight') evidence.push('어깨가 골반보다 넓고 허리선이 완만해 상체 중심의 직선 실루엣에 가깝습니다.');
  if (type === 'wave') evidence.push('어깨가 좁은 편이고 허리가 잘록해 곡선 실루엣에 가깝습니다.');
  if (type === 'natural') evidence.push('키 대비 어깨 프레임이 크고 허리선이 직선적이라 골격감 있는 실루엣에 가깝습니다.');
  evidence.push('사진만으로는 뼈 굵기, 관절 크기, 살의 질감을 알 수 없어 참고용으로만 보세요.');
  return { type, label: BODY_SKELETON_LABEL_KO[type], confidence, evidence };
}
