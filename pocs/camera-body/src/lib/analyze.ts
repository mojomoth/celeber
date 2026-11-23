/**
 * 전신 비율 측정 본체 (순수 함수, 브라우저/서버 공용).
 *
 * 입력: PoseLandmarker 33점(정규화) + 선택: FaceLandmarker 이마(10)·턱(152) 점, 사람 영역 마스크.
 * 출력: BodyAnalysis 계약(측정 실패 시 status 'failed' + 사유).
 *
 * 머리 길이(정수리~턱) 추정 우선순위
 *   1) 얼굴 랜드마크: 턱(152) - 1.25 × (턱 - 이마 상단(10))  — 이마 상단은 헤어라인 근처이므로 정수리까지 보정
 *   2) 포즈만: 눈은 머리 높이의 중간, 눈~입 ≈ 머리 높이의 1/3 (미술 해부학 비례)
 *   마스크의 머리끝(헤어 포함)보다 위로 추정되면 마스크 값으로 내린다(두개골이 머리카락 위로 나갈 수 없음).
 *   얼굴 기준 추정이 헤어 윤곽보다 한참 아래면(모자·고개 숙임) 헤어 윤곽에서 머리카락 두께만큼 내린 곳을 정수리로 본다.
 *   마스크 머리끝이 사진 맨 위에 닿았는데 추정 정수리가 사진 밖이거나 첫 행이 머리 폭 절반 넘게 덮이면 머리가 잘린 것으로 본다.
 * 발바닥: 뒤꿈치/발끝 점의 최하단, 마스크 최하단이 가까우면 마스크 값.
 */
import type { BodyAnalysis, BodyRatios, ImageRef, Issue, Landmark3, Point2 } from '@celeber/core/contracts';
import { LANDMARK_TO_SILHOUETTE_SHOULDER_HIP, classifyFrame, classifySkeleton, type WidthMethod } from './classify';
import { buildInsights, buildStylingGuide, stylingHintStrings } from './interpret';
import { POSE, clamp, dist, jointAngleDeg, leanFromVerticalDeg, mid, round1, round4, tiltDeg, toNorm, toPx, vis, type Px } from './pose';
import { measureSilhouette, type PersonMask, type SilhouetteMeasurement } from './silhouette';

export interface FaceHeadPoints {
  /** FaceLandmarker 10번(이마 상단), 정규화 이미지 좌표 */
  foreheadTop: Point2;
  /** FaceLandmarker 152번(턱 끝) */
  chin: Point2;
  /** FaceLandmarker 눈꼬리 4점(33·133·362·263) 평균. 없으면 포즈 눈 점을 쓴다 */
  eyeMid?: Point2;
}

export interface BodyMeasureInput {
  /** PoseLandmarker 33점 (정규화) */
  landmarks: Landmark3[];
  imageWidth: number;
  imageHeight: number;
  face?: FaceHeadPoints | null;
  mask?: PersonMask | null;
  /** 추가로 검출된 사람 수 (numPoses>1일 때) */
  extraPeople?: number;
  /** 사진 평균 휘도(0..1). 어두운 사진 경고에 쓴다 */
  meanLuminance?: number;
  image?: ImageRef;
  fromUpload?: boolean;
  createdAt?: string;
}

/** 머리/발 키포인트 산출 방법 (keypoints와 함께 설명에 사용) */
export type HeadMethod = 'face' | 'face+mask' | 'pose' | 'pose+mask';

export interface BodyMeasureDetail {
  analysis: BodyAnalysis;
  headMethod: HeadMethod | null;
  widthMethod: WidthMethod | null;
  silhouette: SilhouetteMeasurement | null;
}

const VIS_OK = 0.5;

const issue = (code: string, message: string, severity: Issue['severity'] = 'warn'): Issue => ({ code, message, severity });

/** 사용자가 건너뛴 상태 (후행 리포트에서 '전신 사진 추가'로 표시) */
export function createSkippedBodyAnalysis(createdAt = new Date().toISOString()): BodyAnalysis {
  return {
    version: 1,
    createdAt,
    status: 'skipped',
    failureReasons: [],
    insights: [],
    stylingHints: [],
    source: 'rules',
    isMock: false,
  };
}

/** 검출 자체가 실패한 경우 */
export function createFailedBodyAnalysis(reasons: Issue[], opts: { image?: ImageRef; fromUpload?: boolean; createdAt?: string } = {}): BodyAnalysis {
  return {
    version: 1,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    status: 'failed',
    failureReasons: reasons,
    image: opts.image,
    fromUpload: opts.fromUpload,
    insights: [],
    stylingHints: [],
    source: 'rules',
    isMock: false,
  };
}

export const NO_PERSON_ISSUE = issue('no-person', '사진에서 사람을 찾지 못했습니다. 머리부터 발까지 보이는 정면 전신 사진을 올려 주세요.', 'error');
export const DARK_NO_PERSON_ISSUE = issue('no-person', '사진이 어두워 사람을 찾지 못했습니다. 밝은 곳에서 다시 찍어 주세요.', 'error');
export const FEET_CROPPED_ISSUE = issue('feet-cropped', '발목이나 발이 잘려 키와 다리 길이를 잴 수 없습니다. 발끝까지 들어오게 찍어 주세요.', 'error');
export const FEET_UNCLEAR_ISSUE = issue('feet-unclear', '발목과 발이 또렷하게 보이지 않아 키와 다리 길이를 잴 수 없습니다. 발까지 밝고 선명하게 찍어 주세요.', 'error');
export const FEET_UNCERTAIN_ISSUE = issue('feet-uncertain', '발 위치를 정확히 찾지 못해 키와 다리 길이를 잴 수 없습니다. 발끝까지 또렷하게 보이게 찍어 주세요.', 'error');
/** 어두운 사진(low-light)일 때만 밝기를 안내한다 */
export const FEET_UNCERTAIN_DARK_ISSUE = issue('feet-uncertain', '발 위치를 정확히 찾지 못해 키와 다리 길이를 잴 수 없습니다. 밝은 곳에서 발이 또렷하게 보이게 찍어 주세요.', 'error');
export const HEAD_CROPPED_ISSUE = issue('head-cropped', '머리가 잘렸거나 보이지 않습니다. 머리 위에 여백을 두고 찍어 주세요.', 'error');
export const HEAD_NEAR_EDGE_ISSUE = issue('head-near-edge', '머리가 사진 위 경계에 붙어 있어 머리 길이와 등신이 조금 부정확할 수 있습니다. 머리 위에 여백을 두고 찍으면 더 정확합니다.');
export const BODY_CROPPED_SIDE_ISSUE = issue('body-cropped-side', '몸 한쪽이 사진 옆 경계에서 잘려 어깨·골반 폭을 잴 수 없습니다. 몸 양옆에 여백을 두고 찍어 주세요.', 'error');
export const PHOTO_ROTATED_ISSUE = issue('photo-rotated', '사진이 옆으로 누워 있습니다. 사람이 똑바로 서 보이게 사진을 세워서 올려 주세요.', 'error');
export const CAMERA_TILTED_ISSUE = issue('camera-tilted', '사진이 기울어 있어 비율을 잴 수 없습니다. 카메라를 수평으로 들고 다시 찍어 주세요.', 'error');
export const NOT_STANDING_ISSUE = issue('not-standing', '앉아 있거나 무릎을 크게 굽힌 자세입니다. 선 자세로 찍어 주세요.', 'error');
export const HEAD_TOP_UNCERTAIN_ISSUE = issue('head-top-uncertain', '모자나 머리 모양 때문에 정수리 위치가 정확하지 않을 수 있습니다. 모자를 벗고 찍으면 등신이 더 정확합니다.');
/** 이 사유가 있으면 자세·폭 판정은 잘린 사진에서 나온 값이므로 보여 주지 않는다 */
export const FRAMING_FAILURE_CODES = ['head-cropped', 'body-cropped-side', 'photo-rotated', 'camera-tilted'] as const;
/** 자세에서 나온 실패·경고 코드 (사진이 잘렸거나 누웠으면 근거가 없다) */
export const POSTURE_ISSUE_CODES = ['posture-extreme', 'not-standing', 'turned', 'shoulder-tilt', 'hip-tilt', 'lean', 'knee-bent', 'camera-tilt'] as const;
export const LOW_LIGHT_ISSUE = issue('low-light', '사진이 어두워 관절점 위치가 부정확할 수 있습니다. 밝은 곳에서 찍으면 더 정확합니다.');

/** 평균 휘도가 이보다 낮으면 어두운 사진으로 본다 (데모 사진 0.6~0.8, 밝기 45%로 낮춘 사본 0.34) */
export const LOW_LIGHT_LUMINANCE = 0.35;

/** 사람을 찾지 못했을 때의 사유 (어두운 사진이면 어둡다고 안내) */
export function noPersonIssue(meanLuminance?: number): Issue {
  return meanLuminance !== undefined && meanLuminance < LOW_LIGHT_LUMINANCE ? DARK_NO_PERSON_ISSUE : NO_PERSON_ISSUE;
}

/** RGBA 픽셀의 평균 휘도(0..1, Rec.709). 4픽셀마다 하나씩 표본 */
export function meanLuminanceOf(pixels: { data: ArrayLike<number> }): number {
  const d = pixels.data;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 2 < d.length; i += 16) {
    sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    n++;
  }
  return n ? sum / n / 255 : 0;
}

/** 얼굴을 못 찾았을 때, 눈~어깨 세로 거리가 몸통(어깨~골반)의 이 비율보다 짧으면 포즈 모델이 몸통 안에 만든 가짜 머리로 본다
 *  (데모 사진 0.44~0.54, 목 아래만 남긴 사진 0.24) */
export const HEAD_NECK_MIN = 0.3;
/** 어깨·골반 기울기가 이보다 크면 비율을 내지 않는다 */
export const POSTURE_TILT_MAX = 15;
/** 등신이 이 범위를 벗어나면 머리나 발 위치를 잘못 잡은 것으로 본다 */
export const HEADS_TALL_RANGE: [number, number] = [3.5, 10];
/** 어깨 폭/키가 이보다 작으면 비율을 내지 않는다 */
export const SHOULDER_TO_HEIGHT_MIN = 0.1;
/** 허벅지/정강이 비가 이보다 크면 발목 점이 정강이 위로 올라온 것으로 본다 (정상 사진 0.85~1.1) */
export const THIGH_SHIN_MAX = 1.3;
/** 허벅지/정강이 비가 이보다 작으면 앉아서 허벅지가 카메라 쪽으로 짧아진 것으로 본다
 *  (선 사진 0.99~1.19, 정면에서 앉은 사진 0.17~0.46: 무릎 각도만으로는 못 잡는다) */
export const THIGH_SHIN_MIN = 0.7;

/** 사람 몸에서 나올 수 있는 비율 범위. 측정 단계와 서버 저장 검사가 같은 값을 쓴다(벗어나면 측정 실패, 서버는 400) */
export const RATIO_BOUNDS: Record<string, [number, number]> = {
  // HEADS_TALL_RANGE, SHOULDER_TO_HEIGHT_MIN과 같은 값. 머리 없는 사진의 가짜 머리(10.5등신, 어깨/키 0.07)를 막는다
  headsTall: [3.5, 10],
  headToHeight: [0.07, 0.34],
  upperToLower: [0.3, 3],
  legToHeight: [0.2, 0.85],
  shoulderToHip: [0.4, 3],
  waistToHip: [0.3, 2.5],
  shoulderToHeight: [0.1, 0.6],
  armToHeight: [0.15, 0.8],
  thighToShin: [0.3, 3],
};

/** RATIO_BOUNDS를 벗어난 첫 비율 키 (없으면 null). 유한하지 않거나 0 이하인 값도 벗어난 것으로 본다 */
export function ratioOutOfBounds(ratios: Partial<Record<string, number | undefined>> | undefined): string | null {
  if (!ratios) return null;
  for (const [key, v] of Object.entries(ratios)) {
    if (v === undefined) continue;
    const b = RATIO_BOUNDS[key];
    if (!Number.isFinite(v) || v <= 0 || (b && (v < b[0] || v > b[1]))) return key;
  }
  return null;
}
/** 마스크 발끝이 관절점 발바닥보다 키의 이 비율 넘게 아래면 발 관절점을 믿지 않는다 */
export const SOLE_MASK_GAP_MAX = 0.05;

/** 뒤꿈치·발끝 4점 */
const FOOT_POINTS = [POSE.leftHeel, POSE.rightHeel, POSE.leftFootIndex, POSE.rightFootIndex] as const;
/** 정규화 y가 이 값 이상이면 프레임 하단 경계(잘림)로 본다 */
const FRAME_EDGE = 0.99;
/** 눈은 머리 높이(정수리~턱)의 약 1/2 지점이다. 얼굴 기준 머리 길이가 '눈~턱 × 2'의 이 비율보다 짧으면 그 값까지 올린다.
 *  포즈 눈 점은 흔들림이 커서(같은 사진의 여백·인코딩만 바꿔도 머리 길이 ±8%) 여유를 둔 값이다. */
export const HEAD_EYE_FLOOR = 0.9;
/** 얼굴 랜드마크 눈 중심(눈꼬리 4점)을 쓸 때의 하한 비율. 같은 사진 변형에서 눈~턱 편차 1% 안쪽(실측) */
export const HEAD_FACE_EYE_FLOOR = 0.95;
/** 헤어 윤곽(마스크 머리끝)에서 정수리까지 내리는 머리카락 두께. 머리 길이(눈~턱 × 2) 대비 비율 */
export const HAIR_ALLOWANCE = 0.1;
/** 헤어 윤곽으로 올린 머리 길이의 상한(눈~턱 × 2 대비). 높은 모자·올림머리가 머리로 잡히지 않게 한다
 *  (모자 없는 사진 0.95~1.0, 선바이저 사진 1.07. 1.15면 폼폼 비니·올림머리 정수리가 폼폼·상투 속에 잡혀 6.4~6.6등신) */
export const HEAD_EYE_MAX = 1.05;
/** 헤어 윤곽 보정으로 정수리를 머리 길이의 이 비율 넘게 올렸으면 '정수리 불확실' 경고 (선바이저 사진 0.12~0.15, 모자 없는 사진 0.05) */
export const HEAD_TOP_UNCERTAIN = 0.08;
/** 머리 마스크가 첫 행에 닿을 때 그 행의 사람 구간이 머리 띠 폭의 이 비율 이상이면 머리 중간이 잘린 것 (위 30·45px 제거본 1.2~1.3, 머리끝만 닿은 사진 0.06~0.35) */
export const HEAD_CUT_COVER = 0.5;
/** 몸통(어깨 중점→골반 중점)이 수직에서 이보다 기울면 사진이 옆으로 누운 것으로 본다 */
export const ROTATED_LEAN_MIN = 45;
/** 어깨·골반·몸통 기울기가 모두 같은 방향이고 공통 기울기(cameraTiltDeg)가 이 각도 이상이면 사람이 아니라 카메라가 기운 것으로 본다 */
export const CAMERA_TILT_MIN = 3;
/** 공통 기울기를 볼 때 세 기울기 각각의 최소 크기 (수평에 가까운 선의 부호는 의미가 없다) */
const CAMERA_TILT_EACH_MIN = 1;
/** 카메라 기울기가 이보다 크면 비율을 내지 않는다 (±12° 돌린 사진 공통 기울기 11~12°, ±8° 사진 8°) */
export const CAMERA_TILT_MAX = 10;
/** 정규화 x가 이 범위를 벗어난 어깨·골반·발 점은 사진 옆으로 잘린 것으로 본다 */
const SIDE_EDGE_TOL = 0.005;
/** 머리 마스크가 위 경계에 닿고 추정 정수리가 사진 위쪽 이 비율 안이면 '경계에 붙음' 경고 */
const HEAD_NEAR_EDGE = 0.02;

/** 실루엣 어깨 폭 상한 = 어깨 관절 폭 × 이 값 (삼각근 + 얇은 옷 기준 경험값, 실측 보정 대상) */
export const SHOULDER_SIL_MAX_PER_JOINT = 1.5;
/** 실루엣 골반 폭 하한 = 고관절 점 폭 × 이 값 (팔 보정이 과하게 깎았을 때) */
export const HIP_SIL_MIN_PER_JOINT = 1.15;
/** 실루엣 어깨/골반 비가 이보다 크면 옷 부피 영향을 의심(성인 맨몸 기준 상단을 넘는 값) */
export const SHOULDER_HIP_CLOTHING_SUSPECT = 1.4;

export interface WidthReconcileInput {
  shoulder: number;
  hip: number;
  shoulderJointW: number;
  hipJointW: number;
  armsOverlap: boolean;
}

export interface WidthReconcileResult {
  shoulder: number;
  hip: number;
  shoulderCapped: boolean;
  hipBlended: boolean;
  /** 0..1 — classifyFrame 점수 완화에 사용 */
  uncertainty: number;
  notes: string[];
}

/**
 * 실루엣 폭 타당성 보정 (순수 함수).
 * - 어깨 띠는 위팔·소매를 포함하므로 관절 폭 대비 지나치게 넓으면 상한으로 자른다.
 * - 팔이 허리·골반에 붙어 팔을 빼고 잰 골반 폭은 근사라서, 실루엣 비가 관절점 환산 비와 크게 어긋나면 둘을 평균한 비로 골반 폭을 되돌린다.
 */
export function reconcileSilhouetteWidths(i: WidthReconcileInput): WidthReconcileResult {
  let shoulder = i.shoulder;
  let hip = i.hip;
  let uncertainty = 0;
  let shoulderCapped = false;
  let hipBlended = false;
  const notes: string[] = [];
  const cap = i.shoulderJointW * SHOULDER_SIL_MAX_PER_JOINT;
  if (i.shoulderJointW > 0 && shoulder > cap) {
    shoulder = cap;
    shoulderCapped = true;
    uncertainty += 0.3;
    notes.push('어깨 윤곽이 어깨 관절 폭보다 지나치게 넓어(소매·위팔 부피) 관절 폭 기준 상한으로 줄였습니다.');
  }
  if (i.armsOverlap) {
    uncertainty += 0.3;
    if (i.hipJointW > 0 && hip > 0) {
      const floor = i.hipJointW * HIP_SIL_MIN_PER_JOINT;
      const silRatio = shoulder / hip;
      const lmRatio = (i.shoulderJointW / i.hipJointW) * LANDMARK_TO_SILHOUETTE_SHOULDER_HIP;
      if (hip < floor || Math.abs(silRatio - lmRatio) > 0.12) {
        hip = Math.max(floor, shoulder / ((silRatio + lmRatio) / 2));
        hipBlended = true;
        uncertainty += 0.2;
        notes.push('팔이 몸통에 붙어 골반 윤곽이 불확실해, 관절점 비율과 평균해 골반 폭을 보정했습니다.');
      }
    }
  }
  if (hip > 0 && shoulder / hip > SHOULDER_HIP_CLOTHING_SUSPECT) {
    uncertainty += 0.2;
    notes.push(`어깨/골반 비가 ${SHOULDER_HIP_CLOTHING_SUSPECT}를 넘어 어깨선이 있는 재킷이나 패드 같은 옷 부피가 크게 반영됐을 수 있습니다.`);
  }
  return { shoulder, hip, shoulderCapped, hipBlended, uncertainty: Math.min(1, uncertainty), notes };
}

export interface FeetCropCheck {
  /** 발이 사진 아래 경계로 잘림 */
  cropped: boolean;
  /** 잘린 것은 아니지만 발목이 흐려 관절점을 믿을 수 없음 (어두운 사진, 가림) */
  unclear: boolean;
  /** 판정 근거 (디버깅·테스트용) */
  reasons: Array<'ankle-hidden' | 'ankle-at-edge' | 'foot-outside' | 'no-foot-near-edge' | 'mask-at-edge'>;
}

/**
 * 발이 사진 아래로 잘렸는지 판정 (순수 함수).
 * MediaPipe는 프레임 밖의 발도 좌표를 외삽해 내놓고(y > 1), 발목이 하단 경계에 걸쳐도 visibility가 높게 나올 수 있다.
 * 그래서 visibility와 무관하게 "어느 발 점이라도 경계 밖/위"이면 잘린 것으로 본다.
 *   - 발목이 경계(0.995) 이상
 *   - 뒤꿈치·발끝 중 하나라도 y ≥ 0.99 (visibility 무관)
 *   - 발목이 0.97 아래인데 프레임 안에 보이는 발 점이 없음
 *   - 사람 마스크가 발 범위에서 마지막 행에 닿고, 관절점으로도 발이 하단 2.5% 안에 있음
 *     (발 점이 그보다 위면 밑창이 경계에 붙은 것으로 보고 잘림 대신 경고: look-a 발끝 0.96)
 * 발목이 프레임 안에 있는데 visibility만 낮으면(어두운 사진·가림) 잘림이 아니라 unclear다.
 */
export function detectFeetCropped(L: Landmark3[], maskBottomTouchesEdge = false): FeetCropCheck {
  const reasons: FeetCropCheck['reasons'] = [];
  const la = L[POSE.leftAnkle];
  const ra = L[POSE.rightAnkle];
  if (vis(la) < VIS_OK || vis(ra) < VIS_OK) reasons.push('ankle-hidden');
  const ankleMaxY = Math.max(la.y, ra.y);
  if (ankleMaxY >= 0.995) reasons.push('ankle-at-edge');
  if (FOOT_POINTS.some((i) => L[i].y >= FRAME_EDGE)) reasons.push('foot-outside');
  const footInside = FOOT_POINTS.filter((i) => vis(L[i]) >= 0.3 && L[i].y < FRAME_EDGE);
  if (ankleMaxY > 0.97 && footInside.length === 0) reasons.push('no-foot-near-edge');
  const lowest = Math.max(ankleMaxY, ...FOOT_POINTS.map((i) => L[i].y));
  if (maskBottomTouchesEdge && lowest > 0.975) reasons.push('mask-at-edge');
  const cropped = reasons.some((r) => r !== 'ankle-hidden');
  return { cropped, unclear: !cropped && reasons.includes('ankle-hidden'), reasons };
}

/**
 * 카메라(사진) 공통 기울기 추정 (순수 함수): 어깨·골반 평균 기울기와 몸통 기울기의 평균.
 * 어깨·골반 기울기에는 그 사람의 자세(한쪽 어깨가 처짐 등)가 섞여 있어, 어깨·골반만 보면 같은 각도로 돌린 사진도 방향에 따라 값이 달랐다
 * (look-b +12° 어깨 17°·골반 14°, −12° 어깨 10°·골반 9°). 몸통 기울기와 반반 섞으면 +12° 12.4°, −12° 11.1°.
 */
export function cameraTiltDeg(shoulderTiltDeg: number, hipTiltDeg: number, leanDeg: number): number {
  return ((shoulderTiltDeg + hipTiltDeg) / 2 + leanDeg) / 2;
}

/**
 * 카메라 기울기 판정 (순수 함수). 어깨선·골반선·몸통 기울기가 모두 같은 방향이고 공통 기울기가 CAMERA_TILT_MIN 이상이면 true.
 * 부호 규약: tiltDeg 양수 = 화면 오른쪽 점이 아래, leanFromVerticalDeg 양수 = 위쪽이 화면 오른쪽. 사진을 시계 방향으로 돌리면 셋 다 양수가 된다.
 */
export function isCameraTilt(shoulderTiltDeg: number, hipTiltDeg: number, leanDeg: number): boolean {
  const t = [shoulderTiltDeg, hipTiltDeg, leanDeg];
  if (!t.every((v) => Math.abs(v) >= CAMERA_TILT_EACH_MIN && Math.sign(v) === Math.sign(t[0]))) return false;
  return Math.abs(cameraTiltDeg(shoulderTiltDeg, hipTiltDeg, leanDeg)) >= CAMERA_TILT_MIN;
}

export interface PoseBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 포즈 33점의 사진 안 범위(정규화). visibility 0.3 이상인 점만, 사진 밖 외삽 값은 경계로 자른다 */
export function poseBox(lms: { x: number; y: number; visibility?: number }[]): PoseBox | null {
  const pts = lms.filter((l) => (l.visibility ?? 1) >= 0.3);
  const use = pts.length >= 5 ? pts : lms;
  if (!use.length) return null;
  const xs = use.map((l) => clamp(l.x, 0, 1));
  const ys = use.map((l) => clamp(l.y, 0, 1));
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** 다른 포즈가 별도 사람으로 인정되는 최소 크기(주 인물 키 대비) */
export const EXTRA_PERSON_MIN_HEIGHT = 0.25;
/** 다른 포즈 범위가 주 인물과 작은 쪽 넓이의 이 비율 넘게 겹치면 같은 사람을 두 번 잡은 것으로 본다 */
export const EXTRA_PERSON_MAX_OVERLAP = 0.5;

/**
 * 주 인물 말고 따로 있는 사람 수 (순수 함수). PoseLandmarker(numPoses 2)는 한 사람만 있어도
 * 잘린 몸에 포즈를 하나 더 만들기도 해서, 포즈 개수를 그대로 사람 수로 쓰지 않는다.
 * 키가 주 인물의 EXTRA_PERSON_MIN_HEIGHT 이상이고 겹침이 EXTRA_PERSON_MAX_OVERLAP 미만인 포즈만 센다.
 */
export function countExtraPeople(people: { x: number; y: number; visibility?: number }[][], mainIdx: number): number {
  const main = people[mainIdx] ? poseBox(people[mainIdx]) : null;
  if (!main) return 0;
  const area = (b: PoseBox) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  let n = 0;
  people.forEach((p, i) => {
    if (i === mainIdx) return;
    const b = poseBox(p);
    if (!b || b.y1 - b.y0 < (main.y1 - main.y0) * EXTRA_PERSON_MIN_HEIGHT) return;
    const inter = Math.max(0, Math.min(b.x1, main.x1) - Math.max(b.x0, main.x0)) * Math.max(0, Math.min(b.y1, main.y1) - Math.max(b.y0, main.y0));
    const small = Math.min(area(b), area(main));
    if (small > 0 && inter / small >= EXTRA_PERSON_MAX_OVERLAP) return;
    n++;
  });
  return n;
}

/** 몸의 옆이 사진 밖으로 나간 관절점 (어깨·골반·발목·뒤꿈치·발끝) */
const SIDE_POINTS = [POSE.leftShoulder, POSE.rightShoulder, POSE.leftHip, POSE.rightHip, POSE.leftAnkle, POSE.rightAnkle, ...FOOT_POINTS] as const;

/**
 * 몸 옆이 사진 좌우 경계로 잘렸는지 (순수 함수).
 * MediaPipe는 프레임 밖 관절도 x < 0 또는 x > 1로 외삽한다. 마스크의 어깨·허리·골반 구간이 좌우 끝 열에 닿아도 잘린 것으로 본다.
 */
export function detectSideCropped(L: Landmark3[], maskSideTouchesEdge = false): boolean {
  if (maskSideTouchesEdge) return true;
  return SIDE_POINTS.some((i) => L[i].x < -SIDE_EDGE_TOL || L[i].x > 1 + SIDE_EDGE_TOL);
}

/**
 * 전신 비율 측정. 측정 가능한 항목만 채우고, 머리/발이 잘렸거나 몸통이 가려지면 status 'failed'.
 */
export function computeBodyAnalysis(input: BodyMeasureInput): BodyAnalysis {
  return computeBodyAnalysisDetailed(input).analysis;
}

export function computeBodyAnalysisDetailed(input: BodyMeasureInput): BodyMeasureDetail {
  const { landmarks: L, imageWidth: W, imageHeight: H } = input;
  const createdAt = input.createdAt ?? new Date().toISOString();
  const base = { image: input.image, fromUpload: input.fromUpload, createdAt };
  if (!L || L.length < 33 || !(W > 0) || !(H > 0)) {
    return { analysis: createFailedBodyAnalysis([NO_PERSON_ISSUE], base), headMethod: null, widthMethod: null, silhouette: null };
  }

  const P = (i: number): Px => toPx(L[i], W, H);
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const dark = input.meanLuminance !== undefined && input.meanLuminance < LOW_LIGHT_LUMINANCE;
  if (dark) warnings.push(LOW_LIGHT_ISSUE);
  if ((input.extraPeople ?? 0) > 0) warnings.push(issue('multiple-people', '사진에 여러 사람이 있어 가장 크게 보이는 사람을 측정했습니다.'));

  // ---- 몸통 필수 점
  const torsoVisible = [POSE.leftShoulder, POSE.rightShoulder, POSE.leftHip, POSE.rightHip].every((i) => vis(L[i]) >= VIS_OK);
  if (!torsoVisible) errors.push(issue('torso-hidden', '어깨나 골반이 가려져 있습니다. 몸통이 보이도록 정면에서 찍어 주세요.', 'error'));

  const lSh = P(POSE.leftShoulder);
  const rSh = P(POSE.rightShoulder);
  const lHip = P(POSE.leftHip);
  const rHip = P(POSE.rightHip);
  const shMid = mid(lSh, rSh);
  const hipMid = mid(lHip, rHip);
  const lKnee = P(POSE.leftKnee);
  const rKnee = P(POSE.rightKnee);
  const kneeMid = mid(lKnee, rKnee);
  const lAnk = P(POSE.leftAnkle);
  const rAnk = P(POSE.rightAnkle);
  const ankleMid = mid(lAnk, rAnk);
  const shoulderJointW = dist(lSh, rSh);
  const hipJointW = dist(lHip, rHip);

  // ---- 머리 (포즈 기반 추정치)
  const eyeMid = mid(P(POSE.leftEye), P(POSE.rightEye));
  const mouthMid = mid(P(POSE.mouthLeft), P(POSE.mouthRight));
  const headPose = Math.max(dist(eyeMid, mouthMid) * 3, shoulderJointW * 0.45);
  const headVisible = vis(L[POSE.nose]) >= VIS_OK && L[POSE.nose].y > 0.01;

  // ---- 마스크 실루엣
  let sil: SilhouetteMeasurement | null = null;
  if (input.mask && torsoVisible) {
    const mw = input.mask.width;
    const mh = input.mask.height;
    const sx = mw / W;
    const sy = mh / H;
    const m = (p: Px): Px => ({ x: p.x * sx, y: p.y * sy });
    const feetIdx = [POSE.leftAnkle, POSE.rightAnkle, POSE.leftHeel, POSE.rightHeel, POSE.leftFootIndex, POSE.rightFootIndex];
    const feetXs = feetIdx.map((i) => P(i).x * sx);
    const footSpan = Math.max(...feetXs) - Math.min(...feetXs);
    const earW = dist(P(POSE.leftEar), P(POSE.rightEar));
    sil = measureSilhouette(input.mask, {
      shoulderMid: m(shMid),
      hipMid: m(hipMid),
      kneeMid: m(kneeMid),
      armSegments: (
        [
          [POSE.leftShoulder, POSE.leftElbow],
          [POSE.leftElbow, POSE.leftWrist],
          [POSE.rightShoulder, POSE.rightElbow],
          [POSE.rightElbow, POSE.rightWrist],
        ] as const
      )
        .filter(([a, b]) => vis(L[a]) >= 0.3 && vis(L[b]) >= 0.3)
        .map(([a, b]) => [m(P(a)), m(P(b))] as [Px, Px])
        .concat(
          // 손: 손목에서 아래팔 방향으로 아래팔 길이의 0.7배 (손가락 끝까지)
          (
            [
              [POSE.leftElbow, POSE.leftWrist],
              [POSE.rightElbow, POSE.rightWrist],
            ] as const
          )
            .filter(([e, w]) => vis(L[e]) >= 0.3 && vis(L[w]) >= 0.3)
            .map(([e, w]) => {
              const pe = P(e);
              const pw = P(w);
              return [m(pw), m({ x: pw.x + (pw.x - pe.x) * 0.7, y: pw.y + (pw.y - pe.y) * 0.7 })] as [Px, Px];
            }),
        ),
      armHalfWidth: shoulderJointW * 0.16 * sx,
      headCenterX: P(POSE.nose).x * sx,
      headHalfBand: Math.max(earW * 0.5, headPose * 0.25) * sx,
      headSearchBottomY: eyeMid.y * sy,
      feetX0: Math.min(...feetXs) - footSpan * 0.25 - 4,
      feetX1: Math.max(...feetXs) + footSpan * 0.25 + 4,
      feetSearchTopY: ankleMid.y * sy,
    });
    // 마스크 좌표 → 이미지 좌표
    if (sil.topY !== null) sil.topY = sil.topY / sy;
    if (sil.bottomY !== null) sil.bottomY = sil.bottomY / sy;
    for (const k of ['shoulder', 'waist', 'hip'] as const) {
      const r = sil[k];
      if (r) sil[k] = { ...r, y: r.y / sy, x0: r.x0 / sx, x1: r.x1 / sx, width: r.width / sx };
    }
  }

  let headMethod: HeadMethod;
  let headTopY: number;
  let chinY: number;
  let headFromEyes = false;
  let headFromHair = false;
  let headCropped = false;
  if (input.face) {
    const ft = toPx(input.face.foreheadTop, W, H);
    const ch = toPx(input.face.chin, W, H);
    const faceH = dist(ft, ch);
    chinY = ch.y;
    headTopY = ch.y - faceH * 1.25;
    headMethod = 'face';
    // 모자·앞머리 등으로 10번 점이 낮게 잡히면 머리가 짧게 잡히고 등신이 과대해진다(실측: 선바이저 사진 9.2등신).
    // 눈 중심은 얼굴 랜드마크 값을 먼저 쓴다(포즈 눈 점은 같은 사진에서도 ±10px 흔들려 등신이 ±0.3 바뀌었다).
    const faceEye = input.face.eyeMid ? toPx(input.face.eyeMid, W, H) : null;
    const eyeY = faceEye ? faceEye.y : eyeMid.y;
    const floor = faceEye ? HEAD_FACE_EYE_FLOOR : HEAD_EYE_FLOOR;
    const eyeHead = (chinY - eyeY) * 2;
    const eyesOk = faceEye !== null || (vis(L[POSE.leftEye]) >= VIS_OK && vis(L[POSE.rightEye]) >= VIS_OK);
    if (eyesOk && eyeHead > 0 && chinY - headTopY < eyeHead * floor) {
      headTopY = chinY - eyeHead * floor;
      headFromEyes = true;
    }
    if (sil?.topTouchesEdge) {
      // 머리 마스크가 사진 맨 위에 닿았다: 추정 정수리가 사진 밖이거나 첫 행이 머리를 가로질러 잘렸으면 잘림, 바로 안쪽이면 경고
      if (headTopY < 0 || sil.topEdgeCover >= HEAD_CUT_COVER) headCropped = true;
      else if (headTopY < H * HEAD_NEAR_EDGE) warnings.push(HEAD_NEAR_EDGE_ISSUE);
    }
    // 마스크로 확인할 수 없으면 보정만으로 '머리 잘림'이 되지 않게 사진 위쪽 경계(0)에서 멈춘다
    if (!headCropped && headTopY < 0) headTopY = Math.min(0, chinY - faceH * 1.25);
    // 선바이저·모자를 쓰거나 고개를 숙이면 이마 점과 눈~턱이 모두 짧게 잡혀 정수리가 헤어 윤곽보다 한참 아래로 온다
    // (실측: 선바이저 사진 정수리가 로고 위, 8.5등신). 헤어 윤곽에서 머리카락 두께만큼 내린 곳까지 올리되 눈~턱 × 2 × HEAD_EYE_MAX를 넘기지 않는다.
    if (!headCropped && sil?.topY != null) {
      const ref = eyesOk && eyeHead > 0 ? eyeHead : chinY - headTopY;
      const hairCrown = Math.max(sil.topY + ref * HAIR_ALLOWANCE, chinY - ref * HEAD_EYE_MAX);
      if (ref > 0 && hairCrown < headTopY) {
        if (headTopY - hairCrown > ref * HEAD_TOP_UNCERTAIN) warnings.push(HEAD_TOP_UNCERTAIN_ISSUE);
        headTopY = hairCrown;
        headFromHair = true;
        headMethod = 'face+mask';
      }
    }
  } else {
    chinY = eyeMid.y + headPose * 0.5;
    headTopY = eyeMid.y - headPose * 0.5;
    headMethod = 'pose';
  }
  if (sil?.topY != null && sil.topY > headTopY) {
    headTopY = sil.topY;
    headMethod = headMethod === 'face' ? 'face+mask' : 'pose+mask';
  }
  const headLen = chinY - headTopY;
  // 머리가 사진 밖이면 포즈 모델이 티셔츠 안에 코·눈을 만들어 낸다(visibility 1). 얼굴을 못 찾았을 때만 의심한다.
  //   - 눈~어깨가 몸통 대비 지나치게 짧음  - 마스크 머리 영역이 사진 맨 위 행에 닿음
  //   - 마스크(사람 픽셀)가 포즈로 추정한 정수리보다 머리 하나 넘게 위로 이어짐
  let fakeHead = false;
  if (!input.face) {
    const torsoLen = hipMid.y - shMid.y;
    if (torsoLen > 0 && (shMid.y - eyeMid.y) / torsoLen < HEAD_NECK_MIN) fakeHead = true;
    if (sil?.topY != null && (sil.topY < H * 0.005 || sil.topY < eyeMid.y - headPose)) fakeHead = true;
  }
  if (!headVisible || fakeHead || headCropped || headTopY < -0.01 * H) {
    errors.push(HEAD_CROPPED_ISSUE);
    headCropped = true;
  }
  const sideCropped = detectSideCropped(L, sil?.sideTouchesEdge ?? false);
  if (sideCropped) errors.push(BODY_CROPPED_SIDE_ISSUE);

  // ---- 발바닥
  const feetCrop = detectFeetCropped(L, sil?.bottomTouchesEdge ?? false);
  const ankleOk = !feetCrop.cropped && !feetCrop.unclear;
  const footPts = FOOT_POINTS.filter((i) => vis(L[i]) >= 0.3 && L[i].y < FRAME_EDGE).map(P);
  let soleY: number | null = null;
  if (feetCrop.cropped) {
    errors.push(FEET_CROPPED_ISSUE);
  } else if (feetCrop.unclear) {
    errors.push(FEET_UNCLEAR_ISSUE);
  } else if (footPts.length >= 2) {
    soleY = Math.max(...footPts.map((p) => p.y));
    const approxHeight = soleY - headTopY;
    if (sil?.bottomY != null && sil.bottomY > soleY + approxHeight * SOLE_MASK_GAP_MAX) {
      // 마스크 발끝이 관절점 발바닥보다 한참 아래: 발 관절점이 정강이에 찍힌 경우(어두운 사진 실측 sole 0.87, 실제 0.99)
      errors.push(dark ? FEET_UNCERTAIN_DARK_ISSUE : FEET_UNCERTAIN_ISSUE);
      soleY = null;
    } else if (sil?.bottomY != null && sil.bottomY >= soleY - approxHeight * 0.005) {
      // 두꺼운 밑창은 발끝 점보다 아래에 있다 → 마스크 발끝을 발바닥으로
      soleY = sil.bottomY;
    }
    if (sil?.bottomTouchesEdge) warnings.push(issue('feet-near-edge', '발이 사진 아래 경계에 붙어 있어 발바닥 위치가 조금 부정확할 수 있습니다. 발 아래에 여백을 두고 찍으면 더 정확합니다.'));
  } else {
    // 발이 잘 안 보이면 발목 높이(머리 길이의 약 0.3배)만큼 더한다
    const est = Math.max(lAnk.y, rAnk.y) + headLen * 0.3;
    if (est >= H * 0.995) {
      // 추정한 발바닥이 사진 밖이면 발이 잘린 것 — 키·다리 길이를 만들어 내지 않는다
      errors.push(FEET_CROPPED_ISSUE);
    } else {
      soleY = est;
      warnings.push(issue('feet-estimated', '발끝이 흐려 발목 위치로 발바닥을 추정했습니다.'));
    }
  }
  const kneesOk = vis(L[POSE.leftKnee]) >= VIS_OK && vis(L[POSE.rightKnee]) >= VIS_OK;
  if (!kneesOk && ankleOk) warnings.push(issue('knees-hidden', '무릎이 가려져 다리 구간 비율이 부정확할 수 있습니다.'));

  // ---- 자세
  const shoulderTiltDeg = round1(tiltDeg(lSh, rSh));
  const hipTiltDeg = round1(tiltDeg(lHip, rHip));
  const leanDeg = round1(leanFromVerticalDeg(hipMid, shMid));
  const postureWarnings: Issue[] = [];
  const tiltMax = Math.max(Math.abs(shoulderTiltDeg), Math.abs(hipTiltDeg));
  // 어깨·골반·몸통이 모두 같은 방향으로 기울면 자세가 아니라 카메라(사진)가 기운 것이다(실측: 12° 돌린 사진 어깨 17°·골반 14°·몸통 9°).
  // 몸을 비틀거나 한쪽 다리에 기대 선 자세는 어깨와 골반이 반대로 기운다. 실패·경고는 공통 기울기로 판단한다(돌린 방향과 상관없이 같은 판정).
  const cameraTilt = torsoVisible && Math.abs(leanDeg) <= ROTATED_LEAN_MIN && isCameraTilt(shoulderTiltDeg, hipTiltDeg, leanDeg);
  if (cameraTilt) {
    const camDeg = Math.abs(cameraTiltDeg(shoulderTiltDeg, hipTiltDeg, leanDeg));
    if (camDeg > CAMERA_TILT_MAX) errors.push(CAMERA_TILTED_ISSUE);
    else {
      const deg = Math.round(camDeg);
      warnings.push(issue('camera-tilt', `사진이 ${deg}° 정도 기울어 있어 비율이 조금 부정확할 수 있습니다. 카메라를 수평으로 들고 찍으면 더 정확합니다.`));
    }
  } else {
    if (Math.abs(shoulderTiltDeg) > 4) postureWarnings.push(issue('shoulder-tilt', `어깨가 ${Math.abs(shoulderTiltDeg).toFixed(0)}° 기울어 있습니다. 양쪽 어깨 높이를 맞춰 서 주세요.`));
    if (Math.abs(hipTiltDeg) > 4) postureWarnings.push(issue('hip-tilt', `골반이 ${Math.abs(hipTiltDeg).toFixed(0)}° 기울어 있습니다. 한쪽 다리에 체중을 싣지 말고 서 주세요.`));
    if (tiltMax > POSTURE_TILT_MAX) {
      errors.push(issue('posture-extreme', '어깨나 골반이 크게 기울어 비율을 잴 수 없습니다. 정면으로 곧게 서서 찍어 주세요.', 'error'));
    }
    if (Math.abs(leanDeg) > 5) postureWarnings.push(issue('lean', `몸통이 수직에서 ${Math.abs(leanDeg).toFixed(0)}° 기울어 있습니다. 카메라를 수평으로 두고 곧게 서 주세요.`));
  }
  const kneeAngles = [
    [POSE.leftHip, POSE.leftKnee, POSE.leftAnkle],
    [POSE.rightHip, POSE.rightKnee, POSE.rightAnkle],
  ].map(([a, b, c]) => jointAngleDeg(P(a), P(b), P(c)));
  const minKnee = Math.min(...kneeAngles);
  if (ankleOk && kneesOk) {
    if (minKnee < 120) errors.push(NOT_STANDING_ISSUE);
    else if (minKnee < 160) postureWarnings.push(issue('knee-bent', '무릎이 굽어 다리가 짧게 측정될 수 있습니다.'));
    // 정강이가 허벅지보다 한참 짧으면 발목 점이 정강이 중간에 찍힌 것이다(어두운 사진 실측 1.36, 정상 0.85~1.1)
    const thighShinMean = (dist(lHip, lKnee) / Math.max(1, dist(lKnee, lAnk)) + dist(rHip, rKnee) / Math.max(1, dist(rKnee, rAnk))) / 2;
    if (soleY !== null && thighShinMean > THIGH_SHIN_MAX) {
      errors.push(dark ? FEET_UNCERTAIN_DARK_ISSUE : FEET_UNCERTAIN_ISSUE);
      soleY = null;
    }
    // 정면에서 앉으면 허벅지가 카메라 쪽으로 누워 짧게 보이고 무릎 각도는 펴진 것처럼 잡힌다(앉은 사진 0.17~0.46, 무릎 140° 이상)
    if (minKnee >= 120 && thighShinMean < THIGH_SHIN_MIN) errors.push(NOT_STANDING_ISSUE);
  }

  // ---- 사진 조건
  const heightPx = soleY !== null ? soleY - headTopY : NaN;
  if (!errors.length && Number.isFinite(heightPx) && headLen > 0) {
    const ht = heightPx / headLen;
    if (ht < HEADS_TALL_RANGE[0] || ht > HEADS_TALL_RANGE[1]) {
      errors.push(issue('implausible-ratio', `머리와 키의 비율(${ht.toFixed(1)}등신)이 사람 범위를 벗어났습니다. 머리부터 발끝까지 또렷하게 보이는 사진으로 다시 찍어 주세요.`, 'error'));
    }
  }
  if (Number.isFinite(heightPx)) {
    if (heightPx < H * 0.45) warnings.push(issue('too-small', '사람이 작게 찍혔습니다. 화면 세로의 70~90%를 채우면 더 정확합니다.'));
    if (shoulderJointW / heightPx < 0.12) warnings.push(issue('turned', '몸이 옆으로 돌아가 있어 어깨·골반 폭이 좁게 측정될 수 있습니다. 정면으로 서 주세요.'));
  }
  if (sil?.armsOverlap) warnings.push(issue('arms-overlap', '팔이 몸통에 붙어 있어 팔 위치를 빼고 허리·골반 폭을 추정했습니다. 팔을 몸에서 살짝 떼고 찍으면 더 정확합니다.'));

  // 사진이 누웠거나(몸통이 45° 넘게 기욺) 머리·몸 옆이 잘렸으면, 그 탓에 생긴 자세·발 판정은 원인이 아니므로 뺀다
  const rotated = torsoVisible && Math.abs(leanDeg) > ROTATED_LEAN_MIN;
  const framingFailed = rotated || headCropped || sideCropped || errors.includes(CAMERA_TILTED_ISSUE);
  if (rotated) {
    errors.splice(0, errors.length, PHOTO_ROTATED_ISSUE);
    for (let i = warnings.length - 1; i >= 0; i--) if (warnings[i].code !== 'low-light') warnings.splice(i, 1);
  } else if (framingFailed) {
    // 자세 판정과 '여러 사람'(잘린 사진에서 포즈가 한 사람을 두 번 잡기도 한다)은 원인이 아니므로 뺀다
    const drop = (x: Issue) => (POSTURE_ISSUE_CODES as readonly string[]).includes(x.code) || x.code === 'multiple-people';
    for (const list of [errors, warnings]) for (let i = list.length - 1; i >= 0; i--) if (drop(list[i])) list.splice(i, 1);
  }
  if (framingFailed) postureWarnings.length = 0;

  const keypoints: Record<string, Point2> = {
    headTop: toNorm({ x: P(POSE.nose).x, y: headTopY }, W, H),
    chin: toNorm({ x: P(POSE.nose).x, y: chinY }, W, H),
    shoulderMid: toNorm(shMid, W, H),
    hipMid: toNorm(hipMid, W, H),
    kneeMid: toNorm(kneeMid, W, H),
    ankleMid: toNorm(ankleMid, W, H),
  };
  if (soleY !== null) keypoints.sole = toNorm({ x: ankleMid.x, y: soleY }, W, H);
  if (sil?.shoulder) {
    keypoints.silShoulderL = toNorm({ x: sil.shoulder.x0, y: sil.shoulder.y }, W, H);
    keypoints.silShoulderR = toNorm({ x: sil.shoulder.x1, y: sil.shoulder.y }, W, H);
  }
  if (sil?.waist) {
    keypoints.silWaistL = toNorm({ x: sil.waist.x0, y: sil.waist.y }, W, H);
    keypoints.silWaistR = toNorm({ x: sil.waist.x1, y: sil.waist.y }, W, H);
  }
  if (sil?.hip) {
    keypoints.silHipL = toNorm({ x: sil.hip.x0, y: sil.hip.y }, W, H);
    keypoints.silHipR = toNorm({ x: sil.hip.x1, y: sil.hip.y }, W, H);
  }

  const posture = { shoulderTiltDeg, hipTiltDeg, leanDeg, warnings: postureWarnings };
  const landmarks = L.map((l) => ({ x: round4(l.x), y: round4(l.y), z: round4(l.z), ...(l.visibility !== undefined ? { visibility: round4(l.visibility) } : {}) }));

  // ---- 폭 (실루엣 우선)
  const silValid = !!(sil?.shoulder && sil?.hip && sil.hip.width > 0);
  const widthMethod: WidthMethod = silValid ? 'silhouette' : 'landmarks';
  const widths = silValid
    ? reconcileSilhouetteWidths({ shoulder: sil!.shoulder!.width, hip: sil!.hip!.width, shoulderJointW, hipJointW, armsOverlap: sil!.armsOverlap })
    : { shoulder: shoulderJointW, hip: hipJointW, shoulderCapped: false, hipBlended: false, uncertainty: 0.5, notes: [] as string[] };
  const shoulderW = widths.shoulder;
  const hipW = widths.hip;
  const waistW = silValid && sil!.waist ? Math.min(sil!.waist.width, hipW * 1.15) : undefined;
  // 보정한 폭에 맞춰 오버레이 폭선도 같은 중심에서 다시 놓는다
  if (silValid && widths.shoulderCapped && sil!.shoulder) {
    const cx = (sil!.shoulder.x0 + sil!.shoulder.x1) / 2;
    keypoints.silShoulderL = toNorm({ x: cx - shoulderW / 2, y: sil!.shoulder.y }, W, H);
    keypoints.silShoulderR = toNorm({ x: cx + shoulderW / 2, y: sil!.shoulder.y }, W, H);
  }
  if (silValid && widths.hipBlended && sil!.hip) {
    const cx = (sil!.hip.x0 + sil!.hip.x1) / 2;
    keypoints.silHipL = toNorm({ x: cx - hipW / 2, y: sil!.hip.y }, W, H);
    keypoints.silHipR = toNorm({ x: cx + hipW / 2, y: sil!.hip.y }, W, H);
  }

  // 어깨 폭이 키의 10%도 안 되면 머리·발 위치나 폭을 잘못 잡은 것이다(목 아래만 남긴 사진 실측 0.07, 정상 0.23~0.28)
  if (!errors.length && Number.isFinite(heightPx) && heightPx > 0 && shoulderW / heightPx < SHOULDER_TO_HEIGHT_MIN) {
    errors.push(issue('implausible-ratio', '어깨 폭과 키의 비율이 사람 범위를 벗어났습니다. 머리부터 발끝까지 정면으로 보이는 사진으로 다시 찍어 주세요.', 'error'));
  }

  const frameReady = torsoVisible && hipW > 0;
  const frame = frameReady
    ? classifyFrame({ shoulderToHip: shoulderW / hipW, waistToHip: waistW !== undefined ? waistW / hipW : undefined, method: widthMethod, uncertainty: widths.uncertainty, notes: widths.notes })
    : undefined;

  const failedDetail = (): BodyMeasureDetail => {
    const analysis: BodyAnalysis = {
      version: 1,
      createdAt,
      status: 'failed',
      // 정수리 불확실은 등신 값에 붙는 경고라 값이 없는 실패 화면에는 내지 않는다
      failureReasons: [...errors, ...warnings.filter((w) => w !== HEAD_TOP_UNCERTAIN_ISSUE)],
      image: input.image,
      fromUpload: input.fromUpload,
      landmarks,
      keypoints,
      // 잘리거나 누운 사진의 폭·체형 점수는 근거가 없다
      frame: torsoVisible && !framingFailed ? frame : undefined,
      posture,
      insights: [],
      stylingHints: [],
      source: 'rules',
      isMock: false,
    };
    return { analysis, headMethod, widthMethod: frameReady && !framingFailed ? widthMethod : null, silhouette: sil };
  };
  if (errors.length || soleY === null || !(heightPx > 0) || !(headLen > 0)) return failedDetail();

  // ---- 비율
  const inFrame = (i: number) => L[i].x >= 0 && L[i].x <= 1 && L[i].y >= 0 && L[i].y <= 1;
  const arm = (s: number, e: number, w: number) => (vis(L[s]) >= VIS_OK && vis(L[e]) >= VIS_OK && vis(L[w]) >= VIS_OK && inFrame(w) ? dist(P(s), P(e)) + dist(P(e), P(w)) : NaN);
  const arms = [arm(POSE.leftShoulder, POSE.leftElbow, POSE.leftWrist), arm(POSE.rightShoulder, POSE.rightElbow, POSE.rightWrist)].filter(Number.isFinite);
  const thighShin = kneesOk ? [dist(lHip, lKnee) / Math.max(1, dist(lKnee, lAnk)), dist(rHip, rKnee) / Math.max(1, dist(rKnee, rAnk))] : [];

  const r4 = (v: number) => Math.round(v * 1000) / 1000;
  const ratios: BodyRatios = {
    headsTall: r4(heightPx / headLen),
    headToHeight: r4(headLen / heightPx),
    upperToLower: r4((hipMid.y - headTopY) / (soleY - hipMid.y)),
    legToHeight: r4((soleY - hipMid.y) / heightPx),
    shoulderToHip: r4(shoulderW / hipW),
    shoulderToHeight: r4(shoulderW / heightPx),
  };
  if (waistW !== undefined) ratios.waistToHip = r4(waistW / hipW);
  if (arms.length) ratios.armToHeight = r4(Math.max(...arms) / heightPx);
  if (thighShin.length) ratios.thighToShin = r4(thighShin.reduce((a, b) => a + b, 0) / thighShin.length);
  // 서버가 저장을 거부할 값이면 여기서 실패로 돌린다('이 결과 사용'을 눌렀는데 저장이 400으로 막히지 않게)
  if (ratioOutOfBounds(ratios)) {
    errors.push(issue('implausible-ratio', '측정한 비율이 사람 몸에서 나올 수 있는 범위를 벗어났습니다. 머리부터 발끝까지 정면으로 곧게 선 사진으로 다시 찍어 주세요.', 'error'));
    return failedDetail();
  }

  const skeleton = classifySkeleton({
    shoulderToHip: ratios.shoulderToHip,
    method: widthMethod,
    waistToHip: ratios.waistToHip,
    upperToLower: ratios.upperToLower,
    shoulderToHeight: ratios.shoulderToHeight,
  });

  const silhouette = {
    shoulder: r4(shoulderW / heightPx),
    hip: r4(hipW / heightPx),
    ...(waistW !== undefined ? { waist: r4(waistW / heightPx) } : {}),
  };

  const guide = buildStylingGuide(ratios, frame?.type);
  const evidenceHead =
    headMethod.startsWith('face')
      ? headFromHair
        ? '머리 길이: 턱과 헤어 윤곽 기준(정수리는 헤어 윤곽에서 머리카락 두께만큼 아래)'
        : '머리 길이: 얼굴 랜드마크(이마·턱) 기준' + (headFromEyes ? ', 이마 점이 낮게 잡혀 눈 위치로 보정' : '') + (headMethod.endsWith('mask') ? ', 헤어 윤곽으로 보정' : '')
      : '머리 길이: 포즈 눈·입 위치로 추정' + (headMethod.endsWith('mask') ? ', 헤어 윤곽으로 보정' : '');

  const analysis: BodyAnalysis = {
    version: 1,
    createdAt,
    status: 'complete',
    failureReasons: warnings,
    image: input.image,
    fromUpload: input.fromUpload,
    landmarks,
    keypoints,
    ratios,
    frame: frame ? { ...frame, evidence: [...frame.evidence, evidenceHead] } : undefined,
    skeleton,
    silhouette,
    posture,
    insights: buildInsights(ratios, widthMethod),
    stylingHints: stylingHintStrings(guide),
    source: 'rules',
    isMock: false,
  };
  return { analysis, headMethod, widthMethod, silhouette: sil };
}

/** BodyAnalysis에서 폭 측정 방법 판별 (silhouette 키포인트가 있으면 실루엣) */
export function widthMethodOf(a: BodyAnalysis): WidthMethod {
  return a.keypoints?.silShoulderL && a.keypoints?.silHipL ? 'silhouette' : 'landmarks';
}

/** 머리 길이(정규화 y) */
export function headUnitOf(a: BodyAnalysis): number | null {
  const t = a.keypoints?.headTop;
  const c = a.keypoints?.chin;
  return t && c ? clamp(c.y - t.y, 0, 1) : null;
}
