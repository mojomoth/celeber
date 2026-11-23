/**
 * /api/report/* 요청·응답 스키마 (클라이언트/서버 공용).
 */
import { z } from 'zod';
import { GenderSchema, type PersonalColorReport, PersonalColorReportSchema, type PersonalColorReportSummary } from '@celeber/core/contracts';

const IdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

/** POST /api/report/generate */
export const GenerateRequestSchema = z.object({
  faceSessionId: IdSchema,
  /** 전신 세션 (없거나 건너뛰면 null → '전신 사진 추가' 카드) */
  bodySessionId: IdSchema.nullable().optional(),
  /** 리포트 변형. 생략하면 얼굴 분석의 사진 기반 기본값(ai.presentation) */
  gender: GenderSchema.optional(),
  /** true면 Claude 서술을 건너뛰고 템플릿 서술 */
  skipAi: z.boolean().optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const GenerateResponseSchema = z.object({
  report: PersonalColorReportSchema,
  aiSource: z.enum(['ai', 'mock', 'skipped']),
  warning: z.string().optional(),
});
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;

/** PATCH /api/report/reports/[id] — 성별/스타일 변형 변경 */
export const VariantRequestSchema = z.object({ gender: GenderSchema });

/** 입력 세션 목록 (GET /api/report/inputs) */
export const InputFaceSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  label: z.string().optional(),
  isMock: z.boolean(),
  thumbnailUrl: z.string().nullable(),
  skinHex: z.string().nullable(),
  skinName: z.string().nullable(),
  lightSourceLabel: z.string().nullable(),
  hasSide: z.boolean(),
  /** 사진 기반 리포트 변형 기본값 */
  presentation: GenderSchema,
});
export type InputFace = z.infer<typeof InputFaceSchema>;

export const InputBodySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  label: z.string().optional(),
  isMock: z.boolean(),
  thumbnailUrl: z.string().optional(),
  summary: z.string(),
});
export type InputBody = z.infer<typeof InputBodySchema>;

export const InputsResponseSchema = z.object({ face: z.array(InputFaceSchema), body: z.array(InputBodySchema) });
export type InputsResponse = z.infer<typeof InputsResponseSchema>;

export function summarizeReport(r: PersonalColorReport): PersonalColorReportSummary {
  return { id: r.id, createdAt: r.createdAt, tone: r.type.tone, nameKo: r.type.nameKo, thumbnail: r.photos.front, isMock: r.isMock };
}

export const GENDER_LABEL_KO = { male: '남성', female: '여성', unspecified: '선택 안 함' } as const;

/** 리포트의 '전신 사진 추가' 카드 문구. 전신을 넣으면 AI를 다시 불러 새 리포트를 만들고, 원래 리포트는 그대로 남는다. */
export const BODY_ADD_DESCRIPTION =
  '전신 사진을 추가하면 등신·상하체·어깨·골반 비율에 맞춘 코디 실루엣 제안을 담은 새 리포트를 만듭니다. 지금 리포트는 그대로 남습니다.';
