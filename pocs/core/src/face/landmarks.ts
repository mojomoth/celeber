/**
 * MediaPipe FaceLandmarker(478점) 인덱스 상수와 기하 유틸.
 * 좌/우는 "피사체 기준"이다 (피사체의 왼쪽 = 비반전 이미지의 오른쪽).
 */

export interface LandmarkLike {
  x: number; // 0..1 (이미지 너비 기준)
  y: number; // 0..1 (이미지 높이 기준)
  z?: number;
}

/** 얼굴 외곽 (시계방향, 이마 중앙 10에서 시작) */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;

export const LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466] as const;
export const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] as const;
export const LEFT_EYEBROW = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336] as const;
export const RIGHT_EYEBROW = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107] as const;
export const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185] as const;
export const LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191] as const;
/** 홍채 (refineLandmarks 478점 모델에서만): 중심 + 4점 */
export const LEFT_IRIS = { center: 473, ring: [474, 475, 476, 477] } as const;
export const RIGHT_IRIS = { center: 468, ring: [469, 470, 471, 472] } as const;
export const NOSE_OUTLINE = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 327, 129, 358, 49, 279] as const;

/** 주요 단일 포인트 */
export const LM = {
  foreheadTop: 10,
  glabella: 9, // 미간 위
  nasion: 168, // 비근점
  noseBridge: 6,
  noseTip: 1,
  subnasale: 2,
  upperLipTop: 0,
  upperLipInner: 13,
  lowerLipInner: 14,
  lowerLipBottom: 17,
  chin: 152,
  /** 광대 최외곽 (피사체 오른쪽/왼쪽) */
  cheekboneRight: 234,
  cheekboneLeft: 454,
  /** 하악각 근처 */
  jawRight: 172,
  jawLeft: 397,
  jawRightUpper: 58,
  jawLeftUpper: 288,
  /** 이마 폭 기준점 (관자놀이 위) */
  foreheadRight: 54,
  foreheadLeft: 284,
  /** 눈 꼬리/앞머리 */
  rightEyeOuter: 33,
  rightEyeInner: 133,
  leftEyeInner: 362,
  leftEyeOuter: 263,
  /** 콧볼 */
  noseWingRight: 129,
  noseWingLeft: 358,
  /** 입꼬리 */
  mouthRight: 61,
  mouthLeft: 291,
  /** 눈썹 중앙 하단 (3분할: 상안부 경계) */
  browCenterRight: 105,
  browCenterLeft: 334,
} as const;

/**
 * 피부 ROI 후보 인덱스 (볼록 껍질로 영역화하므로 순서 무관).
 * 눈·눈썹·입술은 별도 제외 마스크로 빼고, 하이라이트/그림자는 퍼센타일 컷으로 제거한다.
 */
export const SKIN_ROI = {
  forehead: [103, 67, 109, 10, 338, 297, 332, 333, 299, 337, 151, 108, 69, 104],
  rightCheek: [116, 117, 118, 119, 100, 142, 203, 206, 216, 192, 213, 147, 123],
  leftCheek: [345, 346, 347, 348, 329, 371, 423, 426, 436, 416, 433, 376, 352],
  nose: [168, 6, 197, 195, 5, 51, 281, 196, 419],
  chin: [18, 83, 313, 182, 406, 194, 418, 32, 262, 140, 369, 171, 396, 175, 199, 200],
} as const;
export type SkinRoiName = keyof typeof SKIN_ROI;

/** ROI에서 제외할 부위 (볼록 껍질) */
export const SKIN_EXCLUDE = [LEFT_EYE, RIGHT_EYE, LEFT_EYEBROW, RIGHT_EYEBROW, LIPS_OUTER] as const;

/* ------------------------------------------------------------------ 기하 */

export interface Pt {
  x: number;
  y: number;
}
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** 정규화 좌표 → 픽셀 좌표 (종횡비 보정된 거리 계산용) */
export function toPixels(lms: readonly LandmarkLike[], width: number, height: number): Pt[] {
  return lms.map((p) => ({ x: p.x * width, y: p.y * height }));
}
export function pick(lms: readonly Pt[], idx: readonly number[]): Pt[] {
  return idx.map((i) => lms[i]).filter(Boolean);
}

/** Andrew's monotone chain 볼록 껍질 */
export function convexHull(points: readonly Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}
/** 다각형 중심 기준 확대/축소 (factor>1 확대) */
export function scalePolygon(poly: readonly Pt[], factor: number): Pt[] {
  const c = poly.reduce((s, p) => ({ x: s.x + p.x / poly.length, y: s.y + p.y / poly.length }), { x: 0, y: 0 });
  return poly.map((p) => ({ x: c.x + (p.x - c.x) * factor, y: c.y + (p.y - c.y) * factor }));
}
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function polygonArea(poly: readonly Pt[]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(s / 2);
}
export function boundingBox(points: readonly Pt[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 정규화 랜드마크 → 얼굴 bbox (정규화) */
export function faceBoxFromLandmarks(lms: readonly LandmarkLike[]): { x: number; y: number; w: number; h: number } {
  return boundingBox(FACE_OVAL.map((i) => lms[i]).filter(Boolean));
}

/**
 * 랜드마크만으로 근사한 머리 자세(도). 정확도가 필요하면 FaceLandmarker의
 * outputFacialTransformationMatrixes를 쓰는 것이 낫다.
 * yaw: 양수 = 피사체가 자기 왼쪽으로 돌림(이미지에서 코가 오른쪽으로 이동).
 */
export function estimateHeadPose(lms: readonly LandmarkLike[], width = 1, height = 1): { yawDeg: number; pitchDeg: number; rollDeg: number } {
  const P = (i: number) => ({ x: lms[i].x * width, y: lms[i].y * height });
  const r = P(LM.cheekboneRight);
  const l = P(LM.cheekboneLeft);
  const nose = P(LM.noseTip);
  const top = P(LM.foreheadTop);
  const chin = P(LM.chin);
  const eyeR = P(LM.rightEyeOuter);
  const eyeL = P(LM.leftEyeOuter);
  // yaw: 양 광대까지 코끝의 수평 거리 비
  const dl = Math.abs(l.x - nose.x);
  const dr = Math.abs(nose.x - r.x);
  const yawRatio = (dl - dr) / Math.max(1e-6, dl + dr); // -1..1
  const yawDeg = Math.asin(Math.max(-1, Math.min(1, yawRatio))) * (180 / Math.PI) * 1.15;
  // pitch: 코끝 수직 위치 (이마-턱 중앙 대비)
  const dyTop = nose.y - top.y;
  const dyChin = chin.y - nose.y;
  const pitchRatio = (dyTop - dyChin) / Math.max(1e-6, dyTop + dyChin);
  const pitchDeg = (pitchRatio - 0.14) * 90; // 중립 얼굴에서 코끝이 약간 아래(≈0.14)
  const rollDeg = (Math.atan2(eyeL.y - eyeR.y, eyeL.x - eyeR.x) * 180) / Math.PI;
  return { yawDeg, pitchDeg, rollDeg };
}
