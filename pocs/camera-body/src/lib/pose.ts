/**
 * MediaPipe PoseLandmarker 33점 인덱스와 기하 유틸 (브라우저/서버 공용, 순수 함수).
 * 'left/right'는 사진 속 인물 기준이다(정면 사진에서 인물의 왼쪽 = 화면 오른쪽).
 */
import type { Landmark3, Point2 } from '@celeber/core/contracts';

export const POSE = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

/** 오버레이 골격 연결선 */
export const POSE_SEGMENTS: readonly (readonly [number, number])[] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [29, 31],
  [27, 31],
  [28, 30],
  [30, 32],
  [28, 32],
];

/** 오버레이에 점으로 표시할 관절 */
export const POSE_JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32] as const;

export interface Px {
  x: number;
  y: number;
}

export const vis = (l: Landmark3 | undefined): number => (l ? (l.visibility ?? 1) : 0);
export const toPx = (l: Landmark3 | Point2, w: number, h: number): Px => ({ x: l.x * w, y: l.y * h });
export const toNorm = (p: Px, w: number, h: number): Point2 => ({ x: round4(p.x / w), y: round4(p.y / h) });
export const mid = (a: Px, b: Px): Px => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dist = (a: Px, b: Px): number => Math.hypot(a.x - b.x, a.y - b.y);
export const round4 = (v: number): number => Math.round(v * 10000) / 10000;
export const round2 = (v: number): number => Math.round(v * 100) / 100;
export const round1 = (v: number): number => Math.round(v * 10) / 10;

/** 두 점을 잇는 선이 수평에서 기운 각도(도). 양수 = 오른쪽(화면) 점이 아래 */
export function tiltDeg(a: Px, b: Px): number {
  const [l, r] = a.x <= b.x ? [a, b] : [b, a];
  return (Math.atan2(r.y - l.y, r.x - l.x) * 180) / Math.PI;
}

/** 아래 점(bottom)에서 위 점(top)으로 가는 선이 수직에서 기운 각도(도). 양수 = 위쪽이 화면 오른쪽 */
export function leanFromVerticalDeg(bottom: Px, top: Px): number {
  return (Math.atan2(top.x - bottom.x, bottom.y - top.y) * 180) / Math.PI;
}

/** 세 점 a-b-c에서 b의 내각(도) */
export function jointAngleDeg(a: Px, b: Px, c: Px): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const n = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (n === 0) return 180;
  const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / n));
  return (Math.acos(cos) * 180) / Math.PI;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
