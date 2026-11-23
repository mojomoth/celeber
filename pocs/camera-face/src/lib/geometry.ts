/**
 * 정면 얼굴 윤곽/비율 (FaceLandmarker 478점, 순수 함수).
 * - 모든 거리는 픽셀 좌표(종횡비 보정)에서 계산하고, 눈꼬리 선(33→263)이 수평이 되도록 회전한 "얼굴 좌표계"를 쓴다.
 * - 얼굴형은 비율 4개(길이/폭, 이마/광대, 턱/광대, 턱끝 각도)를 형별 원형(평균±표준편차)과 비교한 가우시안 점수.
 *   원형 값은 경험값이며 실측 데이터로 튜닝된 것이 아니다 (README 참고).
 */
import type { FaceGeometry, FaceProfile, FaceRatios, FaceShape } from '@celeber/core/contracts';
import { FACE_SHAPE_LABEL_KO } from '@celeber/core/contracts';
import { FACE_OVAL, LEFT_EYE, LEFT_EYEBROW, LIPS_OUTER, LM, NOSE_OUTLINE, RIGHT_EYE, RIGHT_EYEBROW, type LandmarkLike, type Pt, convexHull } from '@celeber/core/face';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** 얼굴 좌표계 변환기: 눈꼬리 선 기준 회전 (roll 보정) */
export function faceFrame(lms: readonly LandmarkLike[], width: number, height: number) {
  const P = (i: number): Pt => ({ x: lms[i].x * width, y: lms[i].y * height });
  const a = P(LM.rightEyeOuter);
  const b = P(LM.leftEyeOuter);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const o = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const cos = Math.cos(-ang);
  const sin = Math.sin(-ang);
  const T = (i: number): Pt => {
    const p = P(i);
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  };
  const d = (i: number, j: number) => {
    const p = P(i);
    const q = P(j);
    return Math.hypot(p.x - q.x, p.y - q.y);
  };
  return { P, T, d, rollDeg: (ang * 180) / Math.PI };
}

function angleAt(c: Pt, a: Pt, b: Pt): number {
  const v1 = { x: a.x - c.x, y: a.y - c.y };
  const v2 = { x: b.x - c.x, y: b.y - c.y };
  const cosv = (v1.x * v2.x + v1.y * v2.y) / Math.max(1e-9, Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
  return (Math.acos(Math.max(-1, Math.min(1, cosv))) * 180) / Math.PI;
}

/** 턱끝 각도 기준점 (턱선 중간, FACE_OVAL 상의 136/365) */
export const CHIN_ANGLE_POINTS = { right: 136, left: 365 } as const;

export function computeFaceRatios(lms: readonly LandmarkLike[], width: number, height: number): FaceRatios {
  const { T, d } = faceFrame(lms, width, height);
  const faceLength = d(LM.foreheadTop, LM.chin);
  const cheek = d(LM.cheekboneRight, LM.cheekboneLeft);
  const forehead = d(LM.foreheadRight, LM.foreheadLeft);
  const jaw = d(LM.jawRight, LM.jawLeft);
  // 3분할 (얼굴 좌표계 y): 이마 상단(10) ~ 눈썹 중앙 ~ 코밑(2) ~ 턱끝(152)
  const yTop = T(LM.foreheadTop).y;
  const yBrow = (T(LM.browCenterRight).y + T(LM.browCenterLeft).y) / 2;
  const ySub = T(LM.subnasale).y;
  const yChin = T(LM.chin).y;
  const u = Math.max(0, yBrow - yTop);
  const m = Math.max(0, ySub - yBrow);
  const l = Math.max(0, yChin - ySub);
  const sum = Math.max(1e-6, u + m + l);
  const eyeSpacing = d(LM.rightEyeInner, LM.leftEyeInner);
  const eyeWidth = (d(LM.rightEyeOuter, LM.rightEyeInner) + d(LM.leftEyeInner, LM.leftEyeOuter)) / 2;
  const noseWidth = d(LM.noseWingRight, LM.noseWingLeft);
  const lipWidth = d(LM.mouthRight, LM.mouthLeft);
  const upperLip = d(LM.upperLipTop, LM.upperLipInner);
  const lowerLip = d(LM.lowerLipInner, LM.lowerLipBottom);
  const chinAngle = angleAt(T(LM.chin), T(CHIN_ANGLE_POINTS.right), T(CHIN_ANGLE_POINTS.left));

  // 대칭도: 정중선(이마·코·입·턱 x 평균)에서 좌우 대응점까지 거리 차
  const midIdx: number[] = [LM.foreheadTop, LM.nasion, LM.noseTip, LM.subnasale, LM.upperLipTop, LM.lowerLipBottom, LM.chin];
  const midX = midIdx.reduce((s, i) => s + T(i).x, 0) / midIdx.length;
  const pairs: [number, number][] = [
    [LM.cheekboneRight, LM.cheekboneLeft],
    [LM.jawRight, LM.jawLeft],
    [LM.rightEyeOuter, LM.leftEyeOuter],
    [LM.rightEyeInner, LM.leftEyeInner],
    [LM.mouthRight, LM.mouthLeft],
    [LM.noseWingRight, LM.noseWingLeft],
    [LM.foreheadRight, LM.foreheadLeft],
    [CHIN_ANGLE_POINTS.right, CHIN_ANGLE_POINTS.left],
  ];
  const asym =
    pairs.reduce((s, [r, lft]) => {
      const dr = Math.abs(midX - T(r).x);
      const dl = Math.abs(T(lft).x - midX);
      return s + Math.abs(dr - dl) / Math.max(1e-6, dr + dl);
    }, 0) / pairs.length;

  return {
    lengthToWidth: r3(faceLength / Math.max(1e-6, cheek)),
    foreheadToCheekbone: r3(forehead / Math.max(1e-6, cheek)),
    jawToCheekbone: r3(jaw / Math.max(1e-6, cheek)),
    chinAngleDeg: r1(chinAngle),
    thirds: { upper: r3(u / sum), middle: r3(m / sum), lower: r3(l / sum) },
    eyeSpacingToEyeWidth: r3(eyeSpacing / Math.max(1e-6, eyeWidth)),
    noseLengthToFaceLength: r3(d(LM.nasion, LM.subnasale) / Math.max(1e-6, faceLength)),
    noseWidthToEyeSpacing: r3(noseWidth / Math.max(1e-6, eyeSpacing)),
    lipWidthToNoseWidth: r3(lipWidth / Math.max(1e-6, noseWidth)),
    upperToLowerLip: lowerLip > 1e-6 ? r3(upperLip / lowerLip) : undefined,
    symmetry: r3(Math.max(0, Math.min(1, 1 - asym * 2))),
  };
}

/* ------------------------------------------------------------------ 얼굴형 */

type Proto = { L: [number, number]; F: [number, number]; J: [number, number]; C: [number, number] };
/**
 * 얼굴형 원형 (평균, 표준편차). L=길이/광대폭(랜드마크 10–152 / 234–454), F=이마폭(54–284)/광대폭,
 * J=턱폭(172–397)/광대폭, C=턱끝 각도(152에서 136·365). 경험값: 정면 실사진 2장(계란형 기준 L≈1.19, F≈0.85, J≈0.78–0.81,
 * C≈126–130°)을 기준점으로 문헌상 형별 차이(길이/폭 ±0.1~0.15, 턱/광대 ±0.05~0.1)를 적용했다. 실측 데이터 튜닝 전.
 */
export const FACE_SHAPE_PROTOTYPES: Record<FaceShape, Proto> = {
  oval: { L: [1.2, 0.06], F: [0.85, 0.05], J: [0.78, 0.04], C: [122, 10] },
  round: { L: [1.08, 0.06], F: [0.86, 0.05], J: [0.83, 0.04], C: [133, 10] },
  square: { L: [1.12, 0.06], F: [0.89, 0.05], J: [0.87, 0.04], C: [136, 10] },
  oblong: { L: [1.34, 0.07], F: [0.85, 0.05], J: [0.79, 0.05], C: [124, 12] },
  heart: { L: [1.2, 0.07], F: [0.92, 0.04], J: [0.73, 0.04], C: [114, 10] },
  diamond: { L: [1.2, 0.07], F: [0.77, 0.04], J: [0.74, 0.04], C: [118, 10] },
  triangle: { L: [1.13, 0.07], F: [0.77, 0.04], J: [0.87, 0.04], C: [134, 10] },
};
const SHAPES = Object.keys(FACE_SHAPE_PROTOTYPES) as FaceShape[];

export function classifyFaceShape(r: FaceRatios): { shape: FaceShape; scores: Record<FaceShape, number>; evidence: string[] } {
  const raw = {} as Record<FaceShape, number>;
  for (const s of SHAPES) {
    const p = FACE_SHAPE_PROTOTYPES[s];
    const z = (v: number | undefined, [mu, sd]: [number, number], w = 1) => (v === undefined ? 0 : w * ((v - mu) / sd) ** 2);
    raw[s] = Math.exp(-0.5 * (z(r.lengthToWidth, p.L) + z(r.foreheadToCheekbone, p.F) + z(r.jawToCheekbone, p.J) + z(r.chinAngleDeg, p.C, 0.5)));
  }
  const total = SHAPES.reduce((s, k) => s + raw[k], 0);
  const scores = {} as Record<FaceShape, number>;
  for (const s of SHAPES) scores[s] = total > 0 ? Math.round((raw[s] / total) * 1000) / 1000 : 1 / SHAPES.length;
  const shape = SHAPES.reduce((a, b) => (scores[b] > scores[a] ? b : a), 'oval' as FaceShape);
  const second = SHAPES.filter((s) => s !== shape).reduce((a, b) => (scores[b] > scores[a] ? b : a));

  const ev: string[] = [];
  const L = r.lengthToWidth;
  ev.push(`얼굴 길이/광대 폭 ${L.toFixed(2)} — ${L >= 1.3 ? '세로로 긴 편' : L <= 1.1 ? '가로 폭이 넓은 편' : '균형'}`);
  ev.push(`이마 폭/광대 폭 ${r.foreheadToCheekbone.toFixed(2)} — ${r.foreheadToCheekbone >= 0.9 ? '이마가 넓은 편' : r.foreheadToCheekbone <= 0.8 ? '이마가 좁은 편' : '보통'}`);
  ev.push(`턱 폭/광대 폭 ${r.jawToCheekbone.toFixed(2)} — ${r.jawToCheekbone >= 0.85 ? '턱선이 넓고 각진 편' : r.jawToCheekbone <= 0.75 ? '턱선이 갸름한 편' : '보통'}`);
  if (r.chinAngleDeg !== undefined) ev.push(`턱끝 각도 ${Math.round(r.chinAngleDeg)}° — ${r.chinAngleDeg < 116 ? '뾰족한 편' : r.chinAngleDeg > 134 ? '둥글고 넓은 편' : '보통'}`);
  ev.push(`판정 ${FACE_SHAPE_LABEL_KO[shape]} ${Math.round(scores[shape] * 100)}% · 다음 후보 ${FACE_SHAPE_LABEL_KO[second]} ${Math.round(scores[second] * 100)}%`);
  return { shape, scores, evidence: ev };
}

/* ------------------------------------------------------------------ 해석 */

export function interpretRatios(r: FaceRatios): FaceGeometry['interpretations'] {
  const out: FaceGeometry['interpretations'] = [];
  const t = r.thirds;
  const maxThird = t.upper >= t.middle && t.upper >= t.lower ? '상안부' : t.middle >= t.lower ? '중안부' : '하안부';
  const balanced = Math.max(t.upper, t.middle, t.lower) - Math.min(t.upper, t.middle, t.lower) < 0.06;
  out.push({
    key: 'thirds',
    label: '얼굴 3분할',
    value: `${Math.round(t.upper * 100)} : ${Math.round(t.middle * 100)} : ${Math.round(t.lower * 100)}`,
    comment: balanced ? '상·중·하안부가 고르게 나뉩니다. (상안부는 헤어라인이 아닌 이마 상단 기준이라 실제보다 짧게 잡힙니다.)' : `${maxThird}가 상대적으로 깁니다. (상안부는 이마 상단 랜드마크 기준)`,
  });
  const es = r.eyeSpacingToEyeWidth;
  out.push({ key: 'eyeSpacing', label: '눈 사이 거리', value: `눈 폭의 ${es.toFixed(2)}배`, comment: es > 1.6 ? '눈 사이가 넓은 편입니다.' : es < 1.15 ? '눈 사이가 좁은 편입니다.' : '표준 범위의 간격입니다. (랜드마크 눈꼬리가 실제보다 안쪽에 잡혀 1.2~1.6이 일반적)' });
  const nl = r.noseLengthToFaceLength;
  out.push({ key: 'noseLength', label: '코 길이', value: `얼굴 길이의 ${Math.round(nl * 100)}%`, comment: nl > 0.34 ? '코가 긴 편입니다.' : nl < 0.27 ? '코가 짧은 편입니다.' : '보통 길이입니다.' });
  const nw = r.noseWidthToEyeSpacing;
  out.push({ key: 'noseWidth', label: '코 폭', value: `눈 사이 거리의 ${nw.toFixed(2)}배`, comment: nw > 1.15 ? '콧볼이 넓은 편입니다.' : nw < 0.85 ? '콧볼이 좁은 편입니다.' : '눈 사이 거리와 비슷한 표준 폭입니다.' });
  const lw = r.lipWidthToNoseWidth;
  out.push({ key: 'lipWidth', label: '입술 폭', value: `코 폭의 ${lw.toFixed(2)}배`, comment: lw > 1.55 ? '입이 큰 편입니다.' : lw < 1.1 ? '입이 작은 편입니다.' : '보통 크기입니다.' });
  if (r.upperToLowerLip !== undefined) {
    const ul = r.upperToLowerLip;
    out.push({ key: 'lipRatio', label: '윗입술 : 아랫입술', value: `1 : ${(1 / Math.max(0.05, ul)).toFixed(2)}`, comment: ul > 0.9 ? '윗입술이 도톰한 편입니다.' : ul < 0.5 ? '아랫입술이 더 도톰합니다.' : '아랫입술이 조금 더 두꺼운 일반적인 비율입니다.' });
  }
  if (r.symmetry !== undefined) out.push({ key: 'symmetry', label: '좌우 대칭', value: `${Math.round(r.symmetry * 100)}점`, comment: r.symmetry >= 0.9 ? '좌우가 고르게 균형 잡혀 있습니다.' : r.symmetry >= 0.8 ? '약간의 비대칭이 있습니다(대부분의 얼굴이 이 범위).' : '비대칭이 큰 편입니다. 고개 각도 영향일 수 있습니다.' });
  return out;
}

/* ------------------------------------------------------------------ 윤곽 오버레이 */

const norm = (lms: readonly LandmarkLike[], idx: readonly number[]) => idx.map((i) => ({ x: r3(lms[i].x), y: r3(lms[i].y) }));
const hullNorm = (lms: readonly LandmarkLike[], idx: readonly number[]) => convexHull(idx.map((i) => ({ x: lms[i].x, y: lms[i].y }))).map((p) => ({ x: r3(p.x), y: r3(p.y) }));

export function featureOutlines(lms: readonly LandmarkLike[]): Record<string, { x: number; y: number }[]> {
  return {
    rightEye: norm(lms, RIGHT_EYE),
    leftEye: norm(lms, LEFT_EYE),
    rightBrow: hullNorm(lms, RIGHT_EYEBROW),
    leftBrow: hullNorm(lms, LEFT_EYEBROW),
    nose: hullNorm(lms, NOSE_OUTLINE),
    lips: norm(lms, LIPS_OUTER),
  };
}

/** 정면 랜드마크 (+ 측면 프로필) → 계약 FaceGeometry */
export function buildFaceGeometry(lms: readonly LandmarkLike[], width: number, height: number, profile?: FaceProfile | null): FaceGeometry {
  const ratios = computeFaceRatios(lms, width, height);
  const cls = classifyFaceShape(ratios);
  return {
    shape: cls.shape,
    shapeLabel: FACE_SHAPE_LABEL_KO[cls.shape],
    shapeScores: cls.scores,
    shapeEvidence: cls.evidence,
    ratios,
    contour: norm(lms, FACE_OVAL),
    featureOutlines: featureOutlines(lms),
    ...(profile ? { profile } : {}),
    interpretations: interpretRatios(ratios),
  };
}
