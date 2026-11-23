/**
 * camera-face API 요청/응답 계약 (zod). 클라이언트 플로우와 Route Handler가 함께 쓴다.
 * 경로: POST /api/face/environment, POST /api/face/analyze, GET /api/face/sessions, GET|DELETE /api/face/sessions/<id>
 */
import { z } from 'zod';
import { CaptureQualitySchema, EnvironmentAnalysisSchema, FaceAnalysisSchema, FaceSessionSchema, Landmark3Schema } from '@celeber/core/contracts';
import { EncodedMaskSchema } from './mask';

const UploadIdSchema = z.string().regex(/^up_[a-z0-9]+$/, 'uploadId 형식이 아닙니다.');
const Norm01 = z.number().min(0).max(1);

export const EnvironmentRequestSchema = z.object({
  uploadId: UploadIdSchema,
  /** 기존 세션 갱신(기준 백색 재지정 등). 없으면 새 in-progress 세션 생성 */
  sessionId: z.string().optional(),
  /** 흰 종이 위치 (정규화) */
  whitePoint: z.object({ x: Norm01, y: Norm01 }).nullable().optional(),
  fromUpload: z.boolean().optional(),
  /** AI 보조 분석 생략 (기준 백색 재계산처럼 사진이 같을 때) */
  skipAi: z.boolean().optional(),
});
export type EnvironmentRequest = z.infer<typeof EnvironmentRequestSchema>;

export const EnvironmentMetricsSchema = z.object({
  sampleCount: z.number(),
  grayWorldCct: z.number(),
  whitePatchCct: z.number().nullable(),
  tint: z.number(),
  meanSaturation: z.number(),
  skyFraction: z.number(),
  vegetationFraction: z.number(),
  tileCcts: z.array(z.number()),
  mixedMiredStd: z.number(),
  dynamicRange: z.number(),
  brightFraction: z.number(),
  centerMedianLuma: z.number(),
  outdoorScore: z.number(),
  castMagnitude: z.number(),
});

export const EnvironmentResponseSchema = z.object({
  sessionId: z.string(),
  environment: EnvironmentAnalysisSchema,
  metrics: EnvironmentMetricsSchema,
  whiteReference: z.object({ ok: z.boolean(), message: z.string() }).nullable(),
  /** AI 보조 분석 출처 */
  aiSource: z.enum(['ai', 'mock', 'skipped']),
  warning: z.string().optional(),
});
export type EnvironmentResponse = z.infer<typeof EnvironmentResponseSchema>;

/**
 * 요청으로 받는 랜드마크는 정규화 좌표 범위를 강제한다(사진 밖으로 약간 나간 점은 허용).
 * 서버 측 옆선 분석은 얼굴 길이로 반복 횟수를 정하므로 거대값(1e308 등)이 들어오면 이벤트 루프가 멈춘다.
 */
const NormCoord = z.number().min(-0.5).max(1.5);
export const BoundedLandmarkSchema = Landmark3Schema.extend({
  x: NormCoord,
  y: NormCoord,
  z: z.number().min(-10).max(10),
  visibility: z.number().min(-0.01).max(1.01).optional(),
});
const AngleDeg = z.number().min(-360).max(360);

export const CaptureInputSchema = z.object({
  uploadId: UploadIdSchema,
  capturedAt: z.string().optional(),
  /** FaceLandmarker 정규화 랜드마크 (468 또는 478점) */
  landmarks: z.array(BoundedLandmarkSchema).min(468).max(478),
  yawDeg: AngleDeg,
  pitchDeg: AngleDeg,
  rollDeg: AngleDeg,
  quality: CaptureQualitySchema,
  fromUpload: z.boolean(),
  mask: EncodedMaskSchema.optional(),
});
export type CaptureInput = z.infer<typeof CaptureInputSchema>;

/** 측면은 완전 측면에서 얼굴 검출이 안 될 수 있으므로 랜드마크 없이도 받는다 */
export const SideCaptureInputSchema = CaptureInputSchema.extend({
  landmarks: z.array(BoundedLandmarkSchema).min(468).max(478).nullable(),
});
export type SideCaptureInput = z.infer<typeof SideCaptureInputSchema>;

export const AnalyzeRequestSchema = z.object({
  sessionId: z.string().optional(),
  front: CaptureInputSchema,
  side: SideCaptureInputSchema.nullable().optional(),
  label: z.string().max(80).optional(),
  skipAi: z.boolean().optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const AnalyzeResponseSchema = z.object({
  sessionId: z.string(),
  session: FaceSessionSchema,
  analysis: FaceAnalysisSchema,
  aiSource: z.enum(['ai', 'mock', 'skipped']),
  warning: z.string().optional(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export const FaceSessionSummarySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(['in-progress', 'complete', 'failed']),
  label: z.string().optional(),
  isMock: z.boolean(),
  thumbnailUrl: z.string().nullable(),
  skinHex: z.string().nullable(),
  skinName: z.string().nullable(),
  shapeLabel: z.string().nullable(),
  lightSourceLabel: z.string().nullable(),
  hasSide: z.boolean(),
});
export type FaceSessionSummary = z.infer<typeof FaceSessionSummarySchema>;
