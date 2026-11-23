/**
 * 브라우저 측정값 계약 (celeb-vibe 전용).
 * 브라우저에서 FaceLandmarker / PoseLandmarker / 셀피 세그멘터로 사진을 측정한 결과를 서버로 보낸다.
 * 서버는 이 값을 규칙 판정(분석 가능성·피부/의상 색·체형 비율)과 AI 프롬프트의 근거로 쓴다.
 * 좌표는 모두 이미지 너비/높이 기준 0..1 정규화.
 */
import { z } from 'zod';

/** 클라이언트 측정값 배열 상한 (과대 페이로드가 kv에 그대로 저장되지 않도록) */
export const MEASUREMENT_LIMITS = { keypoints: 33, faceBoxes: 8, regions: 10, clusters: 8, notes: 20, noteLength: 300, edgePx: 20000 } as const;

/** 검출기 실행 상태. 'failed' = 모델/wasm 로드 또는 실행 오류 (검출 0건과 구분) */
export const DetectorStatusSchema = z.enum(['ok', 'failed', 'skipped']);
export type DetectorStatus = z.infer<typeof DetectorStatusSchema>;

const Num = z.number().refine((v) => Number.isFinite(v), '유한한 숫자');
/** RGB 채널 0..255 (클라이언트가 보낸 값이므로 범위를 강제) */
const Channel = z.number().min(0).max(255);
export const MRgbSchema = z.object({ r: Channel, g: Channel, b: Channel });
export type MRgb = z.infer<typeof MRgbSchema>;
export const MBoxSchema = z.object({ x: Num, y: Num, w: Num, h: Num });
export type MBox = z.infer<typeof MBoxSchema>;

/** 색 표본 (robust 평균 또는 클러스터 대표색) */
export const ColorSampleSchema = z.object({
  rgb: MRgbSchema,
  /** 사용 픽셀 수 */
  used: z.number().int().nonnegative(),
  /** 밝기 표준편차 (균일도) */
  lumaStd: Num.optional(),
});
export type ColorSample = z.infer<typeof ColorSampleSchema>;

/** 클러스터 (dominant color) */
export const ColorClusterSchema = z.object({ rgb: MRgbSchema, hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, '#RRGGBB 형식'), share: z.number().min(0).max(1) });
export type ColorCluster = z.infer<typeof ColorClusterSchema>;

export const OutfitRegionKeySchema = z.enum(['torsoCenter', 'torsoSides', 'arms', 'legs', 'feet']);
export type OutfitRegionKey = z.infer<typeof OutfitRegionKeySchema>;

/** 포즈 기반 의상 영역 측정 */
export const RegionMeasurementSchema = z.object({
  key: OutfitRegionKeySchema,
  box: MBoxSchema,
  pixelCount: z.number().int().nonnegative(),
  clusters: z.array(ColorClusterSchema).max(MEASUREMENT_LIMITS.clusters),
});
export type RegionMeasurement = z.infer<typeof RegionMeasurementSchema>;

export const FaceMeasurementSchema = z.object({
  box: MBoxSchema,
  /** 원본 해상도 기준 얼굴 높이(px) */
  heightPx: Num,
  yawDeg: Num,
  /** 얼굴 영역 평균 luma */
  faceMeanLuma: Num,
  skin: ColorSampleSchema,
  /** 측정된 피부 ROI 수 (이마/양 볼/턱 중) */
  skinRegionCount: z.number().int(),
  /** ROI 간 평균 ΔE2000 */
  regionSpreadDeltaE: Num,
  hair: ColorSampleSchema.extend({ method: z.enum(['segmentation', 'heuristic']) }).optional(),
  eyes: ColorSampleSchema.optional(),
  lips: ColorSampleSchema.optional(),
});
export type FaceMeasurement = z.infer<typeof FaceMeasurementSchema>;

export const BodyMeasurementSchema = z.object({
  headsTall: Num.optional(),
  upperToLower: Num.optional(),
  legToHeight: Num.optional(),
  shoulderToHip: Num.optional(),
});
export type BodyMeasurement = z.infer<typeof BodyMeasurementSchema>;

export const SceneMeasurementSchema = z.object({
  meanLuma: Num,
  /** 0..1 */
  clippedHigh: Num,
  clippedLow: Num,
  /** 평균 채도 근사 (max-min)/255, 0..1 */
  meanSaturation: Num,
  /** 흑백(무채색) 사진 */
  grayscale: z.boolean(),
  /** gray-world 게인 (참고용) */
  grayWorldGains: MRgbSchema,
  /** 게인에서 추정한 장면 색온도(K) */
  cctK: Num.optional(),
});
export type SceneMeasurement = z.infer<typeof SceneMeasurementSchema>;

export const VibeMeasurementSchema = z.object({
  version: z.literal(1),
  /** 원본 이미지 크기 */
  width: z.number().int().positive().max(MEASUREMENT_LIMITS.edgePx),
  height: z.number().int().positive().max(MEASUREMENT_LIMITS.edgePx),
  /** 측정에 쓴 축소 크기 */
  analyzedWidth: z.number().int().positive().max(MEASUREMENT_LIMITS.edgePx),
  analyzedHeight: z.number().int().positive().max(MEASUREMENT_LIMITS.edgePx),
  faceCount: z.number().int().nonnegative().max(MEASUREMENT_LIMITS.faceBoxes),
  poseCount: z.number().int().nonnegative().max(MEASUREMENT_LIMITS.faceBoxes),
  /** 검출된 얼굴 상자들 (큰 순) */
  faceBoxes: z.array(MBoxSchema).max(MEASUREMENT_LIMITS.faceBoxes),
  /** 가장 큰 얼굴의 측정값 */
  face: FaceMeasurementSchema.optional(),
  pose: z
    .object({
      /** 33점 (x,y 정규화, v=visibility) */
      keypoints: z.array(z.object({ x: Num, y: Num, v: Num })).max(MEASUREMENT_LIMITS.keypoints),
      visible: z.object({ head: z.boolean(), shoulders: z.boolean(), hips: z.boolean(), knees: z.boolean(), ankles: z.boolean() }),
      framing: z.enum(['full-body', 'upper-body', 'face', 'unknown']),
      personBox: MBoxSchema,
    })
    .optional(),
  regions: z.array(RegionMeasurementSchema).max(MEASUREMENT_LIMITS.regions),
  body: BodyMeasurementSchema.optional(),
  scene: SceneMeasurementSchema,
  segmentation: z.boolean(),
  durationMs: Num,
  /**
   * 검출기별 실행 상태. 없으면(이전 버전 측정값) 모두 'ok'로 본다.
   * 검출기가 실패했는데 인물 0명이면 '인물 없음'이 아니라 '측정 불가'로 보고 서버 통계 경로로 판정한다.
   */
  detectors: z.object({ face: DetectorStatusSchema, pose: DetectorStatusSchema, segmentation: DetectorStatusSchema }).optional(),
  /** 측정 단계별 실패/경고 */
  notes: z.array(z.string().max(MEASUREMENT_LIMITS.noteLength)).max(MEASUREMENT_LIMITS.notes),
});
export type VibeMeasurement = z.infer<typeof VibeMeasurementSchema>;

/** 서버 측 이미지 통계 (sharp, 브라우저 측정이 없을 때도 사용) */
export interface ServerImageStats {
  width: number;
  height: number;
  meanLuma: number;
  clippedHigh: number;
  clippedLow: number;
  meanSaturation: number;
  grayscale: boolean;
  /** 가장자리 대비 피부 후보 픽셀 밝기 비 (역광 근사, 피부 후보 없으면 1) */
  centerToBorderLuma: number;
  /** 상단 중앙의 피부 유사 픽셀 robust 평균 (휴리스틱) */
  heuristicSkin?: ColorSample;
  /** 중앙 영역 의상 후보 클러스터 (상/하) */
  heuristicUpper: ColorCluster[];
  heuristicLower: ColorCluster[];
}
