/**
 * camera-body 계약: 전신 비율, 체형, 자세, 세션 (건너뛰기 상태 포함).
 */
import { z } from 'zod';
import { ImageRefSchema, IsoDateSchema, IssueSchema, Landmark3Schema, Point2Schema, ResultSourceSchema } from './common';

/** 골격 프레임 체형 */
export const BodyFrameSchema = z.enum(['inverted-triangle', 'rectangle', 'triangle', 'hourglass', 'oval']);
export type BodyFrame = z.infer<typeof BodyFrameSchema>;
export const BODY_FRAME_LABEL_KO: Record<BodyFrame, string> = {
  'inverted-triangle': '역삼각형',
  rectangle: '직사각형',
  triangle: '삼각형',
  hourglass: '모래시계형',
  oval: '타원형',
};
/** 골격 진단 3유형 (참고 분류) */
export const BodySkeletonTypeSchema = z.enum(['straight', 'wave', 'natural']);
export type BodySkeletonType = z.infer<typeof BodySkeletonTypeSchema>;
export const BODY_SKELETON_LABEL_KO: Record<BodySkeletonType, string> = {
  straight: '스트레이트',
  wave: '웨이브',
  natural: '내추럴',
};

/** 비율 수치 (모두 단위 없는 비) */
export const BodyRatiosSchema = z.object({
  /** 등신 = 키 / 머리 길이 */
  headsTall: z.number(),
  /** 머리 길이 / 키 */
  headToHeight: z.number(),
  /** 상체(머리끝~골반) / 하체(골반~발바닥) */
  upperToLower: z.number(),
  /** 다리 길이(골반~발목/발바닥) / 키 */
  legToHeight: z.number(),
  /** 어깨 폭 / 골반 폭 */
  shoulderToHip: z.number(),
  /** 허리 폭 / 골반 폭 (실루엣 추정, 선택) */
  waistToHip: z.number().optional(),
  /** 어깨 폭 / 키 */
  shoulderToHeight: z.number(),
  /** 팔 길이 / 키 (선택) */
  armToHeight: z.number().optional(),
  /** 무릎 위치 (다리 중 무릎 위 비율, 선택) */
  thighToShin: z.number().optional(),
});
export type BodyRatios = z.infer<typeof BodyRatiosSchema>;

/** 수치 한 개의 시각화/해석 행 */
export const RatioInsightSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  /** 표시 문자열 (예: '7.4등신', '0.92') */
  display: z.string(),
  /** 표준/이상 참조 범위 */
  reference: z.object({ min: z.number(), max: z.number(), ideal: z.number().optional(), label: z.string() }).optional(),
  /** 한 줄 해석 */
  comment: z.string(),
});
export type RatioInsight = z.infer<typeof RatioInsightSchema>;

export const BodyAnalysisSchema = z.object({
  version: z.literal(1),
  createdAt: IsoDateSchema,
  /** complete: 측정됨 / skipped: 사용자가 건너뜀 / failed: 검출 실패·잘림 */
  status: z.enum(['complete', 'skipped', 'failed']),
  /** failed일 때 사유 (예: '발목이 잘려 다리 길이를 잴 수 없습니다') */
  failureReasons: z.array(IssueSchema),
  image: ImageRefSchema.optional(),
  fromUpload: z.boolean().optional(),
  /** PoseLandmarker 33점 (정규화) */
  landmarks: z.array(Landmark3Schema).optional(),
  /** 머리 꼭대기/발바닥 등 파생 키포인트 (정규화) */
  keypoints: z.record(z.string(), Point2Schema).optional(),
  ratios: BodyRatiosSchema.optional(),
  frame: z
    .object({
      type: BodyFrameSchema,
      label: z.string(),
      scores: z.record(BodyFrameSchema, z.number()),
      evidence: z.array(z.string()),
    })
    .optional(),
  skeleton: z
    .object({ type: BodySkeletonTypeSchema, label: z.string(), confidence: z.number(), evidence: z.array(z.string()) })
    .optional(),
  /** 실루엣 폭(정규화, 키 대비): 어깨/허리/골반 */
  silhouette: z.object({ shoulder: z.number(), waist: z.number().optional(), hip: z.number() }).optional(),
  posture: z
    .object({
      shoulderTiltDeg: z.number(),
      hipTiltDeg: z.number(),
      /** 몸통 기울기(수직 대비) */
      leanDeg: z.number(),
      warnings: z.array(IssueSchema),
    })
    .optional(),
  insights: z.array(RatioInsightSchema),
  /** 코디 실루엣 제안 (리포트 재사용) */
  stylingHints: z.array(z.string()),
  /** Claude 비전 코디/액세서리 서술 (키 있을 때) */
  outfitDescription: z.string().optional(),
  source: ResultSourceSchema,
  isMock: z.boolean(),
});
export type BodyAnalysis = z.infer<typeof BodyAnalysisSchema>;

export const BodySessionSchema = z.object({
  id: z.string(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  label: z.string().optional(),
  analysis: BodyAnalysisSchema,
});
export type BodySession = z.infer<typeof BodySessionSchema>;
