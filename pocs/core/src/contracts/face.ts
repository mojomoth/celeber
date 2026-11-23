/**
 * camera-face 계약: 환경 분석, 얼굴 캡처(정면/측면), 피부색 측정, 얼굴 윤곽/비율, 세션.
 */
import { z } from 'zod';
import {
  BoxSchema,
  GenderSchema,
  ColorValueSchema,
  ImageRefSchema,
  IsoDateSchema,
  IssueSchema,
  Landmark3Schema,
  Point2Schema,
  ResultSourceSchema,
} from './common';

/* ================================================================== 환경 */

/** 광원 종류 추정 */
export const LightSourceSchema = z.enum([
  'daylight', // 직사광/맑은 주광 (5000~6500K)
  'overcast', // 흐린 날/그늘 (6500K+)
  'shade',
  'incandescent', // 백열등/전구색 (2700~3200K)
  'warm-led', // 전구색~온백색 LED (3000~4000K)
  'neutral-led', // 주백색 (4000~5000K)
  'cool-led', // 주광색 LED/형광등 (5500~6500K, 녹색 편향 가능)
  'fluorescent',
  'mixed', // 혼합광
  'unknown',
]);
export type LightSource = z.infer<typeof LightSourceSchema>;

export const BrightnessLevelSchema = z.enum(['too-dark', 'dim', 'normal', 'bright', 'too-bright']);

/**
 * 환경 촬영 분석 결과. 광원/색온도/조도/실내외 + 재촬영 경고.
 * 피부색 화이트밸런스 보정의 입력으로 쓰인다.
 */
export const EnvironmentAnalysisSchema = z.object({
  /** 환경 사진 (선택: 업로드 없이 얼굴 사진 배경으로 추정한 경우 없음) */
  image: ImageRefSchema.optional(),
  capturedAt: IsoDateSchema,
  lightSource: LightSourceSchema,
  /** 한국어 광원 라벨 (예: '주광(자연광)') */
  lightSourceLabel: z.string(),
  /** 추정 상관 색온도(K) */
  cctK: z.number(),
  /** CCT 추정 신뢰도 0..1 */
  cctConfidence: z.number().min(0).max(1),
  brightness: z.object({
    /** 평균 luma 0..255 */
    meanLuma: z.number(),
    /** 중앙값 luma 0..255 */
    medianLuma: z.number().optional(),
    /** 하이라이트 클리핑 비율 0..1 */
    clippedHighlights: z.number().optional(),
    /** 암부 클리핑 비율 0..1 */
    clippedShadows: z.number().optional(),
    level: BrightnessLevelSchema,
    /** 한국어 라벨 (예: '적정') */
    label: z.string(),
  }),
  setting: z.enum(['indoor', 'outdoor', 'unknown']),
  settingLabel: z.string(),
  settingConfidence: z.number().min(0).max(1),
  /** 장면 gray-world 게인 (선형 RGB, g=1) */
  grayWorldGains: z.object({ r: z.number(), g: z.number(), b: z.number() }),
  /** 흰 종이 등 기준 백색을 지정한 경우 그 평균색 */
  referenceWhite: ColorValueSchema.optional(),
  /** 역광/혼합광/어두움/색 캐스트 등 */
  warnings: z.array(IssueSchema),
  /** 경고 중 재촬영이 필요한 수준인지 */
  retakeRecommended: z.boolean(),
  /** 조명 품질 0..1 (신뢰도 계산 입력) */
  lightingQuality: z.number().min(0).max(1),
  /** Claude 보조 분석 서술 (키 있을 때) */
  aiNotes: z.string().optional(),
  source: ResultSourceSchema,
});
export type EnvironmentAnalysis = z.infer<typeof EnvironmentAnalysisSchema>;

/* ================================================================== 캡처 */

export const FacePoseSchema = z.enum(['front', 'side']);

/** 촬영 품질 체크 결과 (실시간 체크의 최종 스냅샷) */
export const CaptureQualitySchema = z.object({
  faceDetected: z.boolean(),
  /** 얼굴 bbox 높이 / 이미지 높이 */
  faceSizeRatio: z.number(),
  /** 얼굴 영역 평균 luma 0..255 */
  faceBrightness: z.number(),
  /** 라플라시안 분산 등 선명도 지표 (선택) */
  sharpness: z.number().optional(),
  /** 검출 신뢰도 0..1 (MediaPipe는 점수를 직접 주지 않으므로 랜드마크 안정성 등으로 대체 가능) */
  detectionScore: z.number().min(0).max(1),
  passed: z.boolean(),
  issues: z.array(IssueSchema),
});
export type CaptureQuality = z.infer<typeof CaptureQualitySchema>;

/** 한 장의 얼굴 캡처 (정면 또는 측면) */
export const FaceCaptureSchema = z.object({
  pose: FacePoseSchema,
  image: ImageRefSchema,
  capturedAt: IsoDateSchema,
  /** 머리 회전(도): yaw 좌우, pitch 상하, roll 기울기. 정면 |yaw|<10, 측면 |yaw|>55 권장 */
  yawDeg: z.number(),
  pitchDeg: z.number(),
  rollDeg: z.number(),
  /** 얼굴 bbox (정규화) */
  faceBox: BoxSchema,
  /** FaceLandmarker 478점 (정규화). 저장 용량이 크면 생략 가능 */
  landmarks: z.array(Landmark3Schema).optional(),
  quality: CaptureQualitySchema,
  /** 업로드 대체 경로로 들어온 사진이면 true */
  fromUpload: z.boolean(),
});
export type FaceCapture = z.infer<typeof FaceCaptureSchema>;

/* ================================================================== 피부색 */

export const SkinRegionSchema = z.enum(['forehead', 'leftCheek', 'rightCheek', 'nose', 'chin']);
export type SkinRegion = z.infer<typeof SkinRegionSchema>;

export const WhiteBalanceMethodSchema = z.enum(['none', 'gray-world', 'reference-white', 'cct', 'combined']);

/**
 * 피부색 측정. raw = 촬영 그대로, corrected = 화이트밸런스 보정 후.
 * 퍼스널컬러 분류기의 핵심 입력은 corrected.lab.
 */
export const SkinColorMeasurementSchema = z.object({
  raw: ColorValueSchema,
  corrected: ColorValueSchema,
  /** ROI별 측정 (이상치 제거 후) */
  regions: z.array(
    z.object({
      region: SkinRegionSchema,
      raw: ColorValueSchema,
      corrected: ColorValueSchema,
      /** 컷 후 사용 픽셀 수 */
      pixelCount: z.number().int(),
    }),
  ),
  /** 전체 사용 픽셀 수 */
  sampleCount: z.number().int(),
  /** 휘도 퍼센타일 컷 (예: 하위 10%, 상위 5%) */
  trim: z.object({ lowPct: z.number(), highPct: z.number() }),
  whiteBalance: z.object({
    method: WhiteBalanceMethodSchema,
    /** 적용한 선형 RGB 게인 */
    gains: z.object({ r: z.number(), g: z.number(), b: z.number() }),
    /** 보정 강도 0..1 (gray-world는 과보정 방지를 위해 부분 적용) */
    strength: z.number(),
    /** 참고한 광원 CCT */
    sourceCctK: z.number().optional(),
    /** 보정 전후 피부색 ΔE2000 (보정량) */
    deltaE: z.number(),
  }),
  /** ROI 간 색 편차 ΔE2000 평균 (낮을수록 균일) */
  regionSpreadDeltaE: z.number(),
  /** 측정 신뢰도 0..1 */
  confidence: z.number().min(0).max(1),
  /** 신뢰도 근거 (한국어) */
  confidenceReasons: z.array(z.string()),
});
export type SkinColorMeasurement = z.infer<typeof SkinColorMeasurementSchema>;

/* ================================================================== 얼굴 윤곽 */

export const FaceShapeSchema = z.enum(['oval', 'round', 'square', 'oblong', 'heart', 'diamond', 'triangle']);
export type FaceShape = z.infer<typeof FaceShapeSchema>;
export const FACE_SHAPE_LABEL_KO: Record<FaceShape, string> = {
  oval: '계란형',
  round: '둥근형',
  square: '각진형',
  oblong: '긴형',
  heart: '하트형',
  diamond: '다이아몬드형',
  triangle: '삼각형',
};

/** 정면 비율 수치. 모두 정규화된 거리의 비 (단위 없음) */
export const FaceRatiosSchema = z.object({
  /** 얼굴 길이(이마 상단~턱끝) / 광대 폭 */
  lengthToWidth: z.number(),
  /** 이마 폭 / 광대 폭 */
  foreheadToCheekbone: z.number(),
  /** 턱(하악각) 폭 / 광대 폭 */
  jawToCheekbone: z.number(),
  /** 턱끝 각도(도) — 작을수록 뾰족 */
  chinAngleDeg: z.number().optional(),
  /** 얼굴 3분할 (상안부/중안부/하안부 비율, 합 1) */
  thirds: z.object({ upper: z.number(), middle: z.number(), lower: z.number() }),
  /** 눈 사이 거리 / 한쪽 눈 폭 (≈1이 표준) */
  eyeSpacingToEyeWidth: z.number(),
  /** 코 길이 / 얼굴 길이 */
  noseLengthToFaceLength: z.number(),
  /** 코 폭 / 눈 사이 거리 */
  noseWidthToEyeSpacing: z.number(),
  /** 입술 폭 / 코 폭 */
  lipWidthToNoseWidth: z.number(),
  /** 윗입술:아랫입술 두께 비 */
  upperToLowerLip: z.number().optional(),
  /** 좌우 대칭도 0..1 */
  symmetry: z.number().optional(),
});
export type FaceRatios = z.infer<typeof FaceRatiosSchema>;

/** 측면 프로필 */
export const FaceProfileSchema = z.object({
  /** 측면 주요점 (정규화 좌표, 측면 사진 기준) */
  points: z.object({
    forehead: Point2Schema.optional(),
    nasion: Point2Schema.optional(),
    noseTip: Point2Schema,
    subnasale: Point2Schema.optional(),
    upperLip: Point2Schema.optional(),
    lowerLip: Point2Schema.optional(),
    chin: Point2Schema,
  }),
  /** 프로필 외곽선 (정규화) — SVG 오버레이용 */
  outline: z.array(Point2Schema),
  /** E-line(코끝-턱끝)과 입술 관계: 음수=라인 안쪽, 양수=돌출. 얼굴 길이 대비 비율 */
  eLine: z
    .object({
      upperLipOffset: z.number(),
      lowerLipOffset: z.number(),
      label: z.string(),
    })
    .optional(),
  /** 측면 윤곽 형태 */
  convexity: z.enum(['convex', 'straight', 'concave']),
  convexityLabel: z.string(),
  /** 코 돌출도 (코끝-비근 거리/얼굴 길이) */
  noseProjection: z.number().optional(),
  /** 측정 가능 여부/한계 메모 */
  notes: z.array(z.string()),
});
export type FaceProfile = z.infer<typeof FaceProfileSchema>;

export const FaceGeometrySchema = z.object({
  shape: FaceShapeSchema,
  shapeLabel: z.string(),
  /** 각 얼굴형 점수 0..1 (근거 표시용) */
  shapeScores: z.record(FaceShapeSchema, z.number()),
  /** 판정 근거 (한국어) */
  shapeEvidence: z.array(z.string()),
  ratios: FaceRatiosSchema,
  /** 정면 얼굴 윤곽선 (정규화, FACE_OVAL 순서) — SVG 오버레이 */
  contour: z.array(Point2Schema),
  /** 이목구비 윤곽 (눈/눈썹/코/입) — SVG 오버레이 */
  featureOutlines: z.record(z.string(), z.array(Point2Schema)).optional(),
  profile: FaceProfileSchema.optional(),
  /** 비율별 한 줄 해석 */
  interpretations: z.array(z.object({ key: z.string(), label: z.string(), value: z.string(), comment: z.string() })),
});
export type FaceGeometry = z.infer<typeof FaceGeometrySchema>;

/** 헤어/눈/입술/눈썹 등 부위 색 (퍼스널컬러 대비 계산 입력) */
export const FeatureColorsSchema = z.object({
  hair: ColorValueSchema.optional(),
  eyes: ColorValueSchema.optional(),
  brows: ColorValueSchema.optional(),
  lips: ColorValueSchema.optional(),
  /** 각 부위 측정 방법/한계 메모 */
  notes: z.array(z.string()),
});
export type FeatureColors = z.infer<typeof FeatureColorsSchema>;

/** Claude 비전 보조 서술 (키 있을 때). 신원 판단 금지 */
export const FaceAiDescriptionSchema = z.object({
  hairStyle: z.string(),
  hairColorDescription: z.string(),
  features: z.array(z.string()),
  impression: z.string(),
  environmentNotes: z.string().optional(),
  /**
   * 사진의 스타일 표현(헤어·의상) 기반 리포트 변형 기본값. 신원/생물학적 판단이 아니며
   * personal-color-report에서 사용자가 언제든 바꿀 수 있다. 판단 어려우면 'unspecified'.
   */
  presentation: GenderSchema.optional(),
});
export type FaceAiDescription = z.infer<typeof FaceAiDescriptionSchema>;

/**
 * camera-face의 최종 결과. personal-color-report의 주 입력.
 */
export const FaceAnalysisSchema = z.object({
  version: z.literal(1),
  createdAt: IsoDateSchema,
  environment: EnvironmentAnalysisSchema,
  front: FaceCaptureSchema,
  side: FaceCaptureSchema.optional(),
  skin: SkinColorMeasurementSchema,
  featureColors: FeatureColorsSchema,
  geometry: FaceGeometrySchema,
  ai: FaceAiDescriptionSchema.optional(),
  source: ResultSourceSchema,
  isMock: z.boolean(),
  /** 전체 경고 (환경+캡처 품질) */
  warnings: z.array(IssueSchema),
});
export type FaceAnalysis = z.infer<typeof FaceAnalysisSchema>;

/** face_sessions 테이블의 data 컬럼 + 메타 */
export const FaceSessionSchema = z.object({
  id: z.string(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  status: z.enum(['in-progress', 'complete', 'failed']),
  /** 목록 표시용 라벨 (예: '11/23 오후 · 자연광') */
  label: z.string().optional(),
  analysis: FaceAnalysisSchema.optional(),
  /** in-progress 상태에서 단계별 부분 결과 */
  partial: z
    .object({ environment: EnvironmentAnalysisSchema.optional(), front: FaceCaptureSchema.optional(), side: FaceCaptureSchema.optional() })
    .optional(),
});
export type FaceSession = z.infer<typeof FaceSessionSchema>;
