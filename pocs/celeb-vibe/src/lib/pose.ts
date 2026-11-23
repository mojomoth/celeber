/**
 * PoseLandmarker 33점 → 의상 영역 다각형, 프레이밍, 체형 비율 (순수 함수).
 * 좌표는 0..1 정규화. 이미지 종횡비 보정을 위해 aspect(=width/height)를 받는다.
 */
import type { BodyMeasurement, MBox, OutfitRegionKey } from './measurement';

export interface PosePoint {
  x: number;
  y: number;
  /** visibility 0..1 */
  v: number;
}
export interface P2 {
  x: number;
  y: number;
}

export const POSE = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

const VIS = 0.5;
const inFrame = (p: PosePoint | undefined, margin = 0.02) => !!p && p.v >= VIS && p.x >= -margin && p.x <= 1 + margin && p.y >= -margin && p.y <= 1 + margin;
const mid = (a: P2, b: P2): P2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const lerp = (a: P2, b: P2, t: number): P2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export interface PoseVisibility {
  head: boolean;
  shoulders: boolean;
  hips: boolean;
  knees: boolean;
  ankles: boolean;
}

export function poseVisibility(kp: readonly PosePoint[]): PoseVisibility {
  const both = (a: number, b: number) => inFrame(kp[a]) && inFrame(kp[b]);
  return {
    head: inFrame(kp[POSE.nose]),
    shoulders: both(POSE.leftShoulder, POSE.rightShoulder),
    hips: both(POSE.leftHip, POSE.rightHip),
    knees: inFrame(kp[POSE.leftKnee]) || inFrame(kp[POSE.rightKnee]),
    ankles: inFrame(kp[POSE.leftAnkle]) || inFrame(kp[POSE.rightAnkle]) || inFrame(kp[POSE.leftHeel]) || inFrame(kp[POSE.rightHeel]),
  };
}

/** 프레이밍: 발목까지 보이면 전신, 골반까지면 상반신 */
export function framingFromPose(vis: PoseVisibility, hasFace: boolean): 'full-body' | 'upper-body' | 'face' | 'unknown' {
  if (vis.head && vis.shoulders && vis.hips && vis.knees && vis.ankles) return 'full-body';
  if (vis.shoulders && (vis.hips || vis.knees)) return 'upper-body';
  if (vis.shoulders) return 'upper-body';
  if (hasFace) return 'face';
  return 'unknown';
}

/** 사람 전체 bbox (가시 점 기준 + 머리 여유) */
export function personBox(kp: readonly PosePoint[]): MBox {
  const pts = kp.filter((p) => p.v >= VIS);
  if (!pts.length) return { x: 0, y: 0, w: 1, h: 1 };
  let x0 = Math.min(...pts.map((p) => p.x));
  let x1 = Math.max(...pts.map((p) => p.x));
  let y0 = Math.min(...pts.map((p) => p.y));
  const y1 = Math.max(...pts.map((p) => p.y));
  const pad = (x1 - x0) * 0.12;
  x0 -= pad;
  x1 += pad;
  y0 -= (y1 - y0) * 0.08;
  return clampBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}

export function clampBox(b: MBox): MBox {
  const x = Math.max(0, Math.min(1, b.x));
  const y = Math.max(0, Math.min(1, b.y));
  const x1 = Math.max(0, Math.min(1, b.x + b.w));
  const y1 = Math.max(0, Math.min(1, b.y + b.h));
  return { x, y, w: Math.max(0, x1 - x), h: Math.max(0, y1 - y) };
}

export function polygonsBox(polys: P2[][]): MBox | null {
  const pts = polys.flat();
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return clampBox({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
}

/**
 * 굵은 선분(캡슐 근사 사각형) 다각형. aspect 보정: 정규화 좌표에서 수직 방향 폭을 화면 비율로 맞춘다.
 * halfWidth는 이미지 너비 기준 정규화 값.
 */
export function thickSegment(a: P2, b: P2, halfWidth: number, aspect: number): P2[] {
  // 픽셀 비례 공간으로 변환 (x * aspect)
  const ax = a.x * aspect;
  const bx = b.x * aspect;
  const dx = bx - ax;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1e-6;
  const nx = (-dy / len) * halfWidth * aspect;
  const ny = (dx / len) * halfWidth * aspect;
  const toN = (x: number, y: number): P2 => ({ x: x / aspect, y });
  return [toN(ax + nx, a.y + ny), toN(bx + nx, b.y + ny), toN(bx - nx, b.y - ny), toN(ax - nx, a.y - ny)];
}

export interface OutfitRegionPolys {
  key: OutfitRegionKey;
  polys: P2[][];
}

/**
 * 의상 측정 영역 다각형.
 * - torsoCenter: 어깨-골반 사각형의 가운데 띠 (이너/상의)
 * - torsoSides: 몸통 좌우 띠 (열린 아우터 판별)
 * - arms: 상완 (소매)
 * - legs: 골반→무릎→발목 (하의)
 * - feet: 발목·뒤꿈치·발끝 주변 (신발)
 */
export function outfitRegions(kp: readonly PosePoint[], aspect: number): OutfitRegionPolys[] {
  const out: OutfitRegionPolys[] = [];
  const ls = kp[POSE.leftShoulder];
  const rs = kp[POSE.rightShoulder];
  const lh = kp[POSE.leftHip];
  const rh = kp[POSE.rightHip];
  if (!(inFrame(ls) && inFrame(rs))) return out;

  const shoulderW = Math.hypot((ls.x - rs.x) * aspect, ls.y - rs.y) / aspect;
  // 골반이 안 보이면 어깨 폭의 1.5배 아래로 가정 (상반신 사진)
  const hipsVisible = inFrame(lh) && inFrame(rh);
  const down = { x: 0, y: Math.min(1, shoulderW * aspect * 1.4) };
  const lhp: P2 = hipsVisible ? lh : { x: ls.x, y: Math.min(1, ls.y + down.y) };
  const rhp: P2 = hipsVisible ? rh : { x: rs.x, y: Math.min(1, rs.y + down.y) };

  // 어깨선 약간 아래(목/쇄골 피부 제외)부터 골반 약간 위까지
  const tl = lerp(ls, lhp, 0.12);
  const tr = lerp(rs, rhp, 0.12);
  const bl = lerp(ls, lhp, 0.95);
  const br = lerp(rs, rhp, 0.95);

  const center = [lerp(tl, tr, 0.33), lerp(tl, tr, 0.67), lerp(bl, br, 0.67), lerp(bl, br, 0.33)];
  out.push({ key: 'torsoCenter', polys: [center] });
  const sideL = [lerp(tl, tr, 0.02), lerp(tl, tr, 0.22), lerp(bl, br, 0.22), lerp(bl, br, 0.02)];
  const sideR = [lerp(tl, tr, 0.78), lerp(tl, tr, 0.98), lerp(bl, br, 0.98), lerp(bl, br, 0.78)];
  out.push({ key: 'torsoSides', polys: [sideL, sideR] });

  const armHalf = shoulderW * 0.12;
  const arms: P2[][] = [];
  for (const [s, e] of [
    [POSE.leftShoulder, POSE.leftElbow],
    [POSE.rightShoulder, POSE.rightElbow],
  ] as const) {
    if (inFrame(kp[s]) && inFrame(kp[e])) arms.push(thickSegment(lerp(kp[s], kp[e], 0.15), lerp(kp[s], kp[e], 0.85), armHalf, aspect));
  }
  if (arms.length) out.push({ key: 'arms', polys: arms });

  if (hipsVisible) {
    const hipW = Math.hypot((lh.x - rh.x) * aspect, lh.y - rh.y) / aspect;
    const legHalf = Math.max(hipW * 0.28, shoulderW * 0.1);
    const legs: P2[][] = [];
    for (const [h, k, a] of [
      [POSE.leftHip, POSE.leftKnee, POSE.leftAnkle],
      [POSE.rightHip, POSE.rightKnee, POSE.rightAnkle],
    ] as const) {
      if (!inFrame(kp[k])) continue;
      legs.push(thickSegment(lerp(kp[h], kp[k], 0.1), kp[k], legHalf, aspect));
      if (inFrame(kp[a])) legs.push(thickSegment(kp[k], lerp(kp[k], kp[a], 0.85), legHalf * 0.8, aspect));
    }
    if (legs.length) out.push({ key: 'legs', polys: legs });
  }

  const feet: P2[][] = [];
  for (const [a, h, f] of [
    [POSE.leftAnkle, POSE.leftHeel, POSE.leftFoot],
    [POSE.rightAnkle, POSE.rightHeel, POSE.rightFoot],
  ] as const) {
    const pts = [kp[a], kp[h], kp[f]].filter((p) => inFrame(p, 0));
    if (pts.length < 2) continue;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = shoulderW * 0.08;
    const x0 = Math.min(...xs) - pad;
    const x1 = Math.max(...xs) + pad;
    const y0 = Math.min(...ys) - pad * aspect * 0.3;
    const y1 = Math.max(...ys) + pad * aspect * 0.6;
    feet.push([
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ]);
  }
  if (feet.length) out.push({ key: 'feet', polys: feet });
  return out;
}

/**
 * 체형 비율 추정 (전신 사진에서만 의미 있음). 정면 직립 가정의 근사치다.
 * - 머리 높이: 얼굴 상자 높이 × 1.35 (이마 위 두피 포함), 얼굴이 없으면 코→어깨 중점 수직 거리 × 1.15
 * - 키: 머리 꼭대기 → 발뒤꿈치(또는 발목) 최저점
 * - 상하체 비: (골반 - 머리 꼭대기) / (발 - 골반)
 * - 어깨/골반 폭 비: 어깨 관절 폭 / 골반 관절 폭 (관절 기준이라 실제 외곽선 비보다 크게 나온다)
 */
export function estimateBodyRatios(kp: readonly PosePoint[], aspect: number, faceBox?: MBox): BodyMeasurement | undefined {
  const vis = poseVisibility(kp);
  if (!(vis.shoulders && vis.hips && vis.ankles)) return undefined;
  const ls = kp[POSE.leftShoulder];
  const rs = kp[POSE.rightShoulder];
  const lh = kp[POSE.leftHip];
  const rh = kp[POSE.rightHip];
  const shoulderMid = mid(ls, rs);
  const hipMid = mid(lh, rh);
  const footYs = [POSE.leftHeel, POSE.rightHeel, POSE.leftAnkle, POSE.rightAnkle, POSE.leftFoot, POSE.rightFoot]
    .map((i) => kp[i])
    .filter((p) => inFrame(p))
    .map((p) => p.y);
  if (!footYs.length) return undefined;
  const footY = Math.max(...footYs);

  let headH: number;
  let headTop: number;
  if (faceBox && faceBox.h > 0) {
    // FACE_OVAL 윗점(10번)은 이마 위쪽이라 정수리까지 약 35%를 더한다
    headH = faceBox.h * 1.35;
    headTop = faceBox.y - faceBox.h * 0.35;
  } else {
    const nose = kp[POSE.nose];
    if (!inFrame(nose)) return undefined;
    // 정면 직립에서 코→어깨선 수직 거리 ≈ 머리 높이의 0.87배
    headH = Math.abs(shoulderMid.y - nose.y) * 1.15;
    headTop = nose.y - headH * 0.55;
  }
  const height = footY - headTop;
  if (height <= 0 || headH <= 0) return undefined;
  const shoulderW = Math.hypot((ls.x - rs.x) * aspect, ls.y - rs.y);
  const hipW = Math.hypot((lh.x - rh.x) * aspect, lh.y - rh.y);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    headsTall: r2(height / headH),
    upperToLower: r2((hipMid.y - headTop) / Math.max(1e-6, footY - hipMid.y)),
    legToHeight: r2((footY - hipMid.y) / height),
    shoulderToHip: hipW > 0 ? r2(shoulderW / hipW) : undefined,
  };
}

/** 관절 기준 어깨/골반 비 → 체형 라벨 (근사) */
export function frameLabelFromRatio(shoulderToHip?: number): string | undefined {
  if (shoulderToHip === undefined) return undefined;
  if (shoulderToHip >= 1.85) return '어깨가 넓은 편 (역삼각형 경향)';
  if (shoulderToHip >= 1.35) return '어깨와 골반이 균형 잡힌 편';
  return '하체 볼륨이 있는 편';
}

/**
 * 포즈의 머리 위치 → 얼굴 재검출용 정사각 크롭(정규화). 전신 사진처럼 얼굴이 작을 때 사용.
 * 크기: 어깨 폭과 코→어깨 거리 중 큰 쪽 기준, 원본 픽셀 비율을 유지한다.
 */
export function headCrop(kp: readonly PosePoint[], width: number, height: number): MBox | null {
  const nose = kp[POSE.nose];
  const ls = kp[POSE.leftShoulder];
  const rs = kp[POSE.rightShoulder];
  if (!inFrame(nose)) return null;
  const px = (p: P2) => ({ x: p.x * width, y: p.y * height });
  const n = px(nose);
  let size = 0;
  if (inFrame(ls) && inFrame(rs)) {
    const a = px(ls);
    const b = px(rs);
    size = Math.max(Math.hypot(a.x - b.x, a.y - b.y) * 1.1, Math.abs((a.y + b.y) / 2 - n.y) * 2.6);
  } else {
    const ears = [kp[POSE.leftEar], kp[POSE.rightEar]].filter((p) => inFrame(p, 0.1)).map(px);
    if (ears.length === 2) size = Math.hypot(ears[0].x - ears[1].x, ears[0].y - ears[1].y) * 2.4;
  }
  if (size < 16) return null;
  const x0 = n.x - size / 2;
  const y0 = n.y - size * 0.55;
  return clampBox({ x: x0 / width, y: y0 / height, w: size / width, h: size / height });
}
