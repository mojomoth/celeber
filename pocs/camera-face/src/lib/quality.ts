/**
 * 촬영 품질 체크 (실시간 + 최종): 얼굴 검출, 정면/측면 각도(yaw), 얼굴 크기, 밝기, 선명도.
 * 조건 미충족(error) → 셔터 비활성, 경고(warn) → 촬영 가능하지만 안내.
 */
import type { CaptureQuality, Issue } from '@celeber/core/contracts';
import { type LandmarkLike, estimateHeadPose, faceBoxFromLandmarks } from '@celeber/core/face';

export type FacePose = 'front' | 'side';
export type GuideState = 'idle' | 'ok' | 'warn';

/** 판정 기준 (도/비율/luma). README에 근거를 적었다. */
export const QUALITY_THRESHOLDS = {
  front: { yawOk: 8, yawMax: 12, pitchOk: 10, pitchMax: 15, rollOk: 6, rollMax: 10 },
  side: { yawMin: 35, yawOk: 50, pitchMax: 20, rollMax: 15 },
  size: { min: 0.22, ok: 0.3, max: 0.85 },
  luma: { min: 55, ok: 75, okHigh: 205, max: 225 },
  centerOffset: 0.2,
  sharpnessMin: 18,
} as const;

/**
 * FaceLandmarker facialTransformationMatrixes[0].data(4×4) → |yaw|, |pitch| (도).
 * 행/열 우선 여부와 무관하도록 대칭 성분의 평균 크기를 쓰고, 부호는 랜드마크 근사에서 가져온다.
 */
export function poseFromMatrix(data: ArrayLike<number> | null | undefined, landmarks: readonly LandmarkLike[], width = 1, height = 1): { yawDeg: number; pitchDeg: number; rollDeg: number; method: 'matrix' | 'landmarks' } {
  const approx = estimateHeadPose(landmarks, width, height);
  if (!data || data.length < 16) return { ...approx, method: 'landmarks' };
  const deg = 180 / Math.PI;
  const c = (v: number) => Math.max(-1, Math.min(1, v));
  const yawAbs = ((Math.abs(Math.asin(c(data[8]))) + Math.abs(Math.asin(c(data[2])))) / 2) * deg;
  const pitchAbs = ((Math.abs(Math.atan2(data[6], data[10])) + Math.abs(Math.atan2(data[9], data[10]))) / 2) * deg;
  if (!Number.isFinite(yawAbs) || !Number.isFinite(pitchAbs)) return { ...approx, method: 'landmarks' };
  const sgn = (v: number) => (v < 0 ? -1 : 1);
  return { yawDeg: sgn(approx.yawDeg) * yawAbs, pitchDeg: sgn(approx.pitchDeg) * pitchAbs, rollDeg: approx.rollDeg, method: 'matrix' };
}

/** 그레이 라플라시안 분산 (얼굴 영역, 긴 변 256으로 축소) — 흔들림/초점 지표 */
export function sharpnessOf(img: { data: ArrayLike<number>; width: number; height: number }, box?: { x: number; y: number; w: number; h: number }): number {
  const bx = box ?? { x: 0, y: 0, w: 1, h: 1 };
  const x0 = Math.max(0, Math.floor(bx.x * img.width));
  const y0 = Math.max(0, Math.floor(bx.y * img.height));
  const x1 = Math.min(img.width, Math.ceil((bx.x + bx.w) * img.width));
  const y1 = Math.min(img.height, Math.ceil((bx.y + bx.h) * img.height));
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw < 8 || bh < 8) return 0;
  const scale = Math.min(1, 256 / Math.max(bw, bh));
  const w = Math.max(3, Math.floor(bw * scale));
  const h = Math.max(3, Math.floor(bh * scale));
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x0 + Math.min(bw - 1, Math.floor(x / scale));
      const sy = y0 + Math.min(bh - 1, Math.floor(y / scale));
      const i = (sy * img.width + sx) * 4;
      g[y * w + x] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    }
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      sum += lap;
      sum2 += lap * lap;
      n++;
    }
  if (!n) return 0;
  const m = sum / n;
  return Math.round((sum2 / n - m * m) * 10) / 10;
}

export interface QualityInput {
  pose: FacePose;
  /** 정규화 랜드마크 (없으면 얼굴 미검출) */
  landmarks: readonly LandmarkLike[] | null;
  yawDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  /** 얼굴 영역 평균 luma 0..255 */
  faceLuma: number | null;
  sharpness?: number | null;
  /** 연속 프레임 안정성 0..1 (실시간) */
  stability?: number;
}

export interface QualityResult {
  quality: CaptureQuality;
  guide: GuideState;
  /** 한 줄 안내 (가장 중요한 문제 또는 OK 메시지) */
  message: string;
  /** 셔터 활성 가능 */
  ready: boolean;
}

export function evaluateCaptureQuality(inp: QualityInput): QualityResult {
  const T = QUALITY_THRESHOLDS;
  const issues: Issue[] = [];
  if (!inp.landmarks || inp.landmarks.length < 468) {
    const msg = inp.pose === 'side' ? '옆얼굴을 찾지 못했습니다. 고개를 조금 덜 돌려 주세요.' : '얼굴을 찾지 못했습니다. 윤곽선 안에 얼굴을 맞춰 주세요.';
    return {
      quality: { faceDetected: false, faceSizeRatio: 0, faceBrightness: inp.faceLuma ?? 0, detectionScore: 0, passed: false, issues: [{ code: 'no-face', severity: 'error', message: msg }], ...(inp.sharpness ? { sharpness: inp.sharpness } : {}) },
      guide: 'idle',
      message: msg,
      ready: false,
    };
  }
  const box = faceBoxFromLandmarks(inp.landmarks);
  const size = box.h;
  const cx = box.x + box.w / 2;
  const yaw = inp.yawDeg ?? 0;
  const pitch = inp.pitchDeg ?? 0;
  const roll = inp.rollDeg ?? 0;
  const ay = Math.abs(yaw);

  if (inp.pose === 'front') {
    if (ay > T.front.yawMax) issues.push({ code: 'yaw', severity: 'error', message: `정면을 봐 주세요 (좌우 ${Math.round(ay)}°)` });
    else if (ay > T.front.yawOk) issues.push({ code: 'yaw', severity: 'warn', message: `조금 더 정면을 봐 주세요 (좌우 ${Math.round(ay)}°)` });
    if (Math.abs(pitch) > T.front.pitchMax) issues.push({ code: 'pitch', severity: 'error', message: pitch > 0 ? '턱을 조금 올려 주세요' : '턱을 조금 내려 주세요' });
    else if (Math.abs(pitch) > T.front.pitchOk) issues.push({ code: 'pitch', severity: 'warn', message: '카메라를 눈높이에 맞춰 주세요' });
    if (Math.abs(roll) > T.front.rollMax) issues.push({ code: 'roll', severity: 'error', message: '고개가 기울어져 있습니다. 똑바로 세워 주세요' });
    else if (Math.abs(roll) > T.front.rollOk) issues.push({ code: 'roll', severity: 'warn', message: '고개를 조금 더 똑바로 세워 주세요' });
    if (Math.abs(cx - 0.5) > T.centerOffset) issues.push({ code: 'off-center', severity: 'warn', message: '얼굴을 가운데로 옮겨 주세요' });
  } else {
    if (ay < T.side.yawMin) issues.push({ code: 'yaw', severity: 'error', message: `옆으로 더 돌려 주세요 (현재 ${Math.round(ay)}°)` });
    else if (ay < T.side.yawOk) issues.push({ code: 'yaw', severity: 'warn', message: `조금 더 돌리면 옆선이 정확해집니다 (현재 ${Math.round(ay)}°)` });
    if (Math.abs(pitch) > T.side.pitchMax) issues.push({ code: 'pitch', severity: 'warn', message: '턱을 수평으로 유지해 주세요' });
    if (Math.abs(roll) > T.side.rollMax) issues.push({ code: 'roll', severity: 'warn', message: '고개를 똑바로 세워 주세요' });
  }
  if (size < T.size.min) issues.push({ code: 'too-small', severity: 'error', message: '조금 더 가까이 와 주세요' });
  else if (size < T.size.ok) issues.push({ code: 'too-small', severity: 'warn', message: '조금 더 가까이 오면 정확해집니다' });
  else if (size > T.size.max) issues.push({ code: 'too-large', severity: 'error', message: '조금 뒤로 물러나 주세요' });
  const cut = box.x < 0.005 || box.y < 0.005 || box.x + box.w > 0.995 || box.y + box.h > 0.995;
  if (cut) issues.push({ code: 'face-cut', severity: 'error', message: '얼굴 전체가 화면 안에 들어오게 해 주세요' });

  const L = inp.faceLuma;
  if (L !== null) {
    if (L < T.luma.min) issues.push({ code: 'face-dark', severity: 'error', message: '얼굴이 너무 어둡습니다. 빛을 마주 봐 주세요' });
    else if (L < T.luma.ok) issues.push({ code: 'face-dark', severity: 'warn', message: '얼굴이 조금 어둡습니다' });
    else if (L > T.luma.max) issues.push({ code: 'face-bright', severity: 'error', message: '얼굴이 너무 밝게 날아갑니다. 직사광을 피해 주세요' });
    else if (L > T.luma.okHigh) issues.push({ code: 'face-bright', severity: 'warn', message: '얼굴이 조금 밝습니다' });
  }
  if (inp.sharpness !== null && inp.sharpness !== undefined && inp.sharpness < T.sharpnessMin) {
    issues.push({ code: 'blur', severity: 'warn', message: '사진이 흔들렸거나 초점이 맞지 않았습니다' });
  }
  const full = inp.landmarks.length >= 478 ? 1 : 0.9;
  const detectionScore = Math.round(Math.max(0, Math.min(1, full * (cut ? 0.6 : 0.95) * (inp.stability ?? 1))) * 100) / 100;
  const errors = issues.filter((i) => i.severity === 'error');
  const passed = errors.length === 0;
  const first = errors[0] ?? issues.find((i) => i.severity === 'warn');
  const okMsg = inp.pose === 'front' ? '좋습니다. 그대로 촬영하세요' : '좋습니다. 옆모습 그대로 촬영하세요';
  return {
    quality: {
      faceDetected: true,
      faceSizeRatio: Math.round(size * 1000) / 1000,
      faceBrightness: Math.round((L ?? 0) * 10) / 10,
      ...(inp.sharpness !== null && inp.sharpness !== undefined ? { sharpness: inp.sharpness } : {}),
      detectionScore,
      passed,
      issues,
    },
    guide: passed ? (issues.length ? 'warn' : 'ok') : 'warn',
    message: first ? first.message : okMsg,
    ready: passed,
  };
}

/**
 * 측면 사진으로 옆선을 분석해도 되는지. |yaw|가 측면 오류 기준(35°) 미만이거나
 * 품질 검사에서 yaw 오류가 났으면 정면에 가까운 사진이라 옆선 값이 거짓이 된다.
 */
export function isProfileUsable(side: { landmarks: readonly LandmarkLike[] | null; yawDeg: number; quality?: Pick<CaptureQuality, 'issues'> | null }): boolean {
  if (!side.landmarks) return false;
  if (!(Math.abs(side.yawDeg) >= QUALITY_THRESHOLDS.side.yawMin)) return false;
  return !side.quality?.issues.some((i) => i.code === 'yaw' && i.severity === 'error');
}

export interface ReviewAction {
  /** '사용하기' 버튼 비활성 */
  disabled: boolean;
  label: '사용하기' | '그래도 사용';
  /** 버튼 위에 보여 줄 안내 (없으면 null) */
  note: string | null;
}

/** 촬영 확인 화면의 '사용하기' 버튼 상태. 품질 오류가 있으면 '그래도 사용'으로 바꾸고 결과에 미칠 영향을 알린다. */
export function reviewAction(pose: FacePose | 'environment', draft: { landmarks: readonly LandmarkLike[] | null; yawDeg: number; quality: Pick<QualityResult, 'quality'> | null }): ReviewAction {
  if (pose === 'environment') return { disabled: false, label: '사용하기', note: null };
  const errors = draft.quality?.quality.issues.filter((i) => i.severity === 'error') ?? [];
  if (pose === 'front') {
    if (!draft.landmarks) return { disabled: true, label: '사용하기', note: '얼굴이 보이는 정면 사진이 있어야 다음으로 넘어갈 수 있습니다.' };
    if (errors.length) return { disabled: false, label: '그래도 사용', note: '이대로 쓰면 피부색과 윤곽의 신뢰도가 낮아집니다.' };
    return { disabled: false, label: '사용하기', note: null };
  }
  if (!draft.landmarks) return { disabled: false, label: '그래도 사용', note: '얼굴을 찾지 못해 옆선은 분석하지 않습니다.' };
  if (!isProfileUsable({ landmarks: draft.landmarks, yawDeg: draft.yawDeg, quality: draft.quality?.quality })) {
    return { disabled: false, label: '그래도 사용', note: `정면에 가까운 사진이라(좌우 ${Math.round(Math.abs(draft.yawDeg))}°) 옆선은 분석하지 않습니다.` };
  }
  if (errors.length) return { disabled: false, label: '그래도 사용', note: '옆선 값이 부정확할 수 있습니다.' };
  return { disabled: false, label: '사용하기', note: null };
}

/**
 * 조건 미충족이 오래가면 셔터를 강제로 열어 준다. 단, 정면 단계에서 얼굴이 아예 안 보이면
 * 찍어도 쓸 수 없으므로 열지 않는다(측면은 얼굴 미검출이어도 '그래도 사용'이 가능).
 */
export function canForceShutter(pose: FacePose, failingMs: number, faceDetected: boolean, afterMs = 8000): boolean {
  if (failingMs <= afterMs) return false;
  return pose === 'side' || faceDetected;
}
