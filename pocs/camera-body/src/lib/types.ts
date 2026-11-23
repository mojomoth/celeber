/**
 * camera-body API 입출력 타입 (zod). 클라이언트/서버 공용.
 */
import { BodyAnalysisSchema, BodySessionSchema } from '@celeber/core/contracts';
import { z } from 'zod';

/** '#RRGGBB'만 허용 — 인라인 style background에 들어가므로 url(...) 같은 값을 막는다 */
export const OUTFIT_HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const OutfitColorSchema = z.object({
  hex: z.string().regex(OUTFIT_HEX_RE),
  nameKo: z.string().max(40),
  samples: z.number().int().min(0).max(100_000_000),
});
export const OutfitColorsSchema = z.object({ top: OutfitColorSchema.optional(), bottom: OutfitColorSchema.optional() });

/** AI 코디 서술 (구조화 출력용: 얕고 단순하게) */
export const OutfitAiSchema = z.object({
  summary: z.string(),
  items: z.array(z.object({ category: z.string(), name: z.string(), colorName: z.string() })),
  accessories: z.array(z.string()),
  silhouetteNote: z.string(),
});
export type OutfitAi = z.infer<typeof OutfitAiSchema>;

/** 코디 서술 메타 (kv 'body:outfit:<sessionId>'에 저장) */
export const OutfitMetaSchema = z.object({
  source: z.enum(['ai', 'mock', 'none']),
  model: z.string().nullable(),
  warning: z.string().optional(),
  colors: OutfitColorsSchema,
  detail: OutfitAiSchema.optional(),
});
export type OutfitMeta = z.infer<typeof OutfitMetaSchema>;

/** POST /api/body/analyze 요청 */
export const AnalyzeRequestSchema = z.object({
  analysis: BodyAnalysisSchema,
  label: z.string().max(80).optional(),
  outfitColors: OutfitColorsSchema.optional(),
  /** 코디 서술(Claude 비전) 실행 여부 (기본 true, 키 없으면 색 측정 요약) */
  describeOutfit: z.boolean().optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

/** POST /api/body/analyze 응답 */
export const AnalyzeResponseSchema = z.object({
  session: BodySessionSchema,
  outfit: OutfitMetaSchema.nullable(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

/** 목록 항목 */
export const BodySessionListItemSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  label: z.string().optional(),
  status: z.enum(['complete', 'skipped', 'failed']),
  isMock: z.boolean(),
  thumbnailUrl: z.string().optional(),
  summary: z.string(),
});
export type BodySessionListItem = z.infer<typeof BodySessionListItemSchema>;
