/**
 * 측면 프로필 분석 (순수 함수): 이마–코–입–턱 라인, E-line, 측면 볼록도, 코 돌출도.
 *
 * 방법
 * 1) FaceLandmarker 정중선 랜드마크(이마 10 → 턱 152)를 측면 사진 위 프로필 곡선으로 쓴다.
 * 2) 머리 축(10→152)과 그 수직축(얼굴이 향한 쪽 = 앞)으로 좌표를 바꾼다.
 * 3) 고개를 충분히 돌린 경우(모델 yaw ≥ 35°) 세그멘테이션 마스크가 있으면 각 점을 같은 높이의 실루엣 경계로 맞춘다.
 *    (MediaPipe yaw는 큰 각도에서 작게 나온다: 육안 70° 측면이 약 43°로 추정됨. 그래서 1/sin(yaw) 깊이 보정은 하지 않는다.)
 * 4) 완전 측면이 아니면 앞뒤 거리가 실제보다 작게 측정되므로 E-라인/볼록도 값은 보수적으로 해석한다.
 */
import type { FaceProfile } from '@celeber/core/contracts';
import { FACE_OVAL, type LandmarkLike, type Pt } from '@celeber/core/face';
import type { CategoryMask } from './mask';

/** 이마 → 턱 정중선 인덱스 */
export const PROFILE_MIDLINE = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 11, 12, 13, 14, 15, 16, 17, 18, 200, 199, 175, 152] as const;
const NOSE_TIP_CANDIDATES = [5, 4, 1, 19, 94];
const CHIN_CANDIDATES = [18, 200, 199, 175, 152];

export interface ProfileInput {
  landmarks: readonly LandmarkLike[] | null;
  width: number;
  height: number;
  /** 머리 yaw(도). 없으면 보정 없음 */
  yawDeg?: number | null;
  mask?: CategoryMask | null;
}

export const ELINE_THRESHOLD = 0.012;
/** 실루엣 경계 보정을 적용할 최소 모델 yaw(도) */
export const SNAP_MIN_YAW = 35;
export const CONVEXITY_THRESHOLDS = { convex: 18, straight: 6 };

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function isForeground(mask: CategoryMask, p: Pt, W: number, H: number): boolean {
  const mx = Math.floor((p.x / W) * mask.width);
  const my = Math.floor((p.y / H) * mask.height);
  if (mx < 0 || my < 0 || mx >= mask.width || my >= mask.height) return false;
  return mask.data[my * mask.width + mx] !== 0;
}

export function eLineLabel(upper: number, lower: number): string {
  const m = Math.max(upper, lower);
  if (m > ELINE_THRESHOLD) return '입술이 E-라인보다 앞으로 나온 편';
  if (m > -ELINE_THRESHOLD) return '입술이 E-라인에 가까운 균형형';
  return '입술이 E-라인 안쪽으로 들어간 편';
}

export function convexityOf(deviationDeg: number): { convexity: FaceProfile['convexity']; label: string } {
  if (deviationDeg >= CONVEXITY_THRESHOLDS.convex) return { convexity: 'convex', label: '볼록형 (코밑이 앞으로 나온 옆선)' };
  if (deviationDeg >= CONVEXITY_THRESHOLDS.straight) return { convexity: 'straight', label: '직선형 (이마·코밑·턱이 고른 옆선)' };
  return { convexity: 'concave', label: '오목형 (코밑이 들어간 옆선)' };
}

/** 실루엣 경계 탐색 한 점당 최대 스텝 (안전 상한) */
const MAX_SNAP_STEPS = 4096;

export function analyzeProfile(inp: ProfileInput): FaceProfile | null {
  const lms = inp.landmarks;
  if (!lms || lms.length < 468) return null;
  const W = inp.width;
  const H = inp.height;
  const P = (i: number): Pt => ({ x: lms[i].x * W, y: lms[i].y * H });
  const top = P(10);
  const bottom = P(152);
  const faceLen = Math.hypot(bottom.x - top.x, bottom.y - top.y);
  // 얼굴 길이는 사진 대각선을 넘을 수 없다. 비정상 좌표(무한대·거대값·NaN)는 분석하지 않는다.
  if (!Number.isFinite(faceLen) || faceLen < 10 || faceLen > Math.hypot(W, H)) return null;
  const v = { x: (bottom.x - top.x) / faceLen, y: (bottom.y - top.y) / faceLen };
  const h0 = { x: v.y, y: -v.x };
  const oval = FACE_OVAL.map(P);
  const cen = oval.reduce((s, p) => ({ x: s.x + p.x / oval.length, y: s.y + p.y / oval.length }), { x: 0, y: 0 });
  const nose = P(1);
  const facing = (nose.x - cen.x) * h0.x + (nose.y - cen.y) * h0.y >= 0 ? 1 : -1;
  const hf = { x: h0.x * facing, y: h0.y * facing };

  const ay = inp.yawDeg === null || inp.yawDeg === undefined ? null : Math.abs(inp.yawDeg);
  const notes: string[] = ['측면 사진의 얼굴 정중선 랜드마크로 옆선을 추정했습니다.'];

  // 점 위치 (이미지 픽셀), 필요하면 실루엣 경계로 이동
  const pts = new Map<number, Pt>();
  for (const i of PROFILE_MIDLINE) pts.set(i, P(i));
  let snapped = 0;
  if (inp.mask && (ay === null || ay >= SNAP_MIN_YAW)) {
    const back = faceLen * 0.03;
    const fwd = faceLen * 0.05;
    for (const i of PROFILE_MIDLINE) {
      const p = pts.get(i)!;
      let last: Pt | null = null;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      // 반복 횟수 상한: 얼굴 길이의 8% (위에서 사진 대각선 이하로 제한됨)
      for (let t = -back, n = 0; t <= fwd && n <= MAX_SNAP_STEPS; t += 1, n++) {
        const q = { x: p.x + hf.x * t, y: p.y + hf.y * t };
        if (isForeground(inp.mask, q, W, H)) last = q;
        else if (last) break;
      }
      if (last) {
        pts.set(i, last);
        snapped++;
      }
    }
    if (snapped) notes.push(`세그멘테이션 실루엣 경계로 ${snapped}개 점을 보정했습니다.`);
  }

  // 머리 좌표계: u = 아래쪽, w = 앞쪽
  if (ay !== null && ay < 45) notes.push(`모델 추정 고개 회전 ${Math.round(ay)}°: 덜 돌린 측면은 코·입·턱의 앞뒤 거리가 작게 측정됩니다. 완전히 옆을 볼수록 정확합니다.`);
  const UW = (p: Pt) => {
    const dx = p.x - top.x;
    const dy = p.y - top.y;
    return { u: dx * v.x + dy * v.y, w: dx * hf.x + dy * hf.y };
  };
  const at = (i: number) => UW(pts.get(i) ?? P(i));
  const argmaxW = (idx: number[]) => idx.reduce((a, b) => (at(b).w > at(a).w ? b : a));

  const noseTipIdx = argmaxW(NOSE_TIP_CANDIDATES);
  const chinIdx = argmaxW(CHIN_CANDIDATES);
  const A = at(noseTipIdx);
  const B = at(chinIdx);
  const lipOffset = (i: number) => {
    const L = at(i);
    const len = Math.hypot(B.u - A.u, B.w - A.w);
    if (len < 1e-6) return 0;
    // 선 A→B에 대한 부호 있는 수직 거리 (앞쪽 = 양수)
    const cross = ((B.u - A.u) * (L.w - A.w) - (B.w - A.w) * (L.u - A.u)) / len;
    return cross / faceLen;
  };
  const upper = lipOffset(0);
  const lower = lipOffset(17);

  // 측면 볼록도: 미간(9)–코밑(2)–턱(pog) 각
  const G = at(9);
  const Sn = at(2);
  const v1 = { u: G.u - Sn.u, w: G.w - Sn.w };
  const v2 = { u: B.u - Sn.u, w: B.w - Sn.w };
  const ang = (Math.acos(Math.max(-1, Math.min(1, (v1.u * v2.u + v1.w * v2.w) / Math.max(1e-9, Math.hypot(v1.u, v1.w) * Math.hypot(v2.u, v2.w))))) * 180) / Math.PI;
  const wLineAtSn = G.w + ((B.w - G.w) * (Sn.u - G.u)) / Math.max(1e-6, B.u - G.u);
  const deviation = (Sn.w >= wLineAtSn ? 1 : -1) * (180 - ang);
  const cv = convexityOf(deviation);
  const noseProjection = (A.w - at(168).w) / faceLen;

  const N = (p: Pt) => ({ x: r4(p.x / W), y: r4(p.y / H) });
  const NP = (i: number) => N(pts.get(i) ?? P(i));
  notes.push(`측면 볼록 편차 ${deviation.toFixed(1)}° (미간–코밑–턱 각), E-라인 기준 윗입술 ${(upper * 100).toFixed(1)}%, 아랫입술 ${(lower * 100).toFixed(1)}% (얼굴 길이 대비, 앞쪽 +).`);
  return {
    points: {
      forehead: NP(151),
      nasion: NP(168),
      noseTip: NP(noseTipIdx),
      subnasale: NP(2),
      upperLip: NP(0),
      lowerLip: NP(17),
      chin: NP(chinIdx),
    },
    outline: PROFILE_MIDLINE.map((i) => NP(i)),
    eLine: { upperLipOffset: r4(upper), lowerLipOffset: r4(lower), label: eLineLabel(upper, lower) },
    convexity: cv.convexity,
    convexityLabel: cv.label,
    noseProjection: r3(noseProjection),
    notes,
  };
}
