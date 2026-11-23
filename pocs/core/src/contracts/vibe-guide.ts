/**
 * celeb-vibe-report 계약: 내 퍼스널컬러 리포트 × 연예인 추구미 → 가이드, 갭, 액션.
 */
import { z } from 'zod';
import { ImageRefSchema, IsoDateSchema, NamedColorSchema, ResultSourceSchema } from './common';
import { OutfitCategorySchema } from './vibe';

/** 가이드 한 항목 */
export const GuideItemSchema = z.object({
  title: z.string(),
  detail: z.string(),
  /** 관련 색 (스와치 표시) */
  colors: z.array(NamedColorSchema).optional(),
});
export type GuideItem = z.infer<typeof GuideItemSchema>;

/** 갭 축 */
export const GapAxisSchema = z.enum(['warmth', 'value', 'chroma', 'contrast', 'clarity', 'body-ratio', 'style']);
export type GapAxis = z.infer<typeof GapAxisSchema>;

export const GapSchema = z.object({
  axis: GapAxisSchema,
  label: z.string(), // '웜/쿨'
  /** 0..100 */
  me: z.number(),
  celeb: z.number(),
  /** celeb - me */
  gap: z.number(),
  /** 축 양끝 라벨 (예: ['쿨', '웜']) */
  poles: z.tuple([z.string(), z.string()]),
  comment: z.string(),
  /** 내 정보가 없어 비교 불가(예: 전신 없음) */
  unavailable: z.boolean().optional(),
});
export type Gap = z.infer<typeof GapSchema>;

/** 연예인 코디 색 → 내 베스트 컬러 치환 */
export const ColorSubstitutionSchema = z.object({
  category: OutfitCategorySchema,
  itemName: z.string(),
  celebColor: NamedColorSchema,
  myColor: NamedColorSchema,
  /** 원색과 치환색의 ΔE2000 (작을수록 원래 룩 유지) */
  deltaE: z.number(),
  /** 원래 색이 이미 내 팔레트에 맞으면 true (치환 불필요) */
  keepOriginal: z.boolean(),
  reason: z.string(),
});
export type ColorSubstitution = z.infer<typeof ColorSubstitutionSchema>;

export const VibeGuideSchema = z.object({
  id: z.string(),
  version: z.literal(1),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  reportId: z.string(),
  vibeAnalysisId: z.string(),
  celebId: z.string().optional(),
  celebName: z.string(),
  lookName: z.string(),
  thumbnail: ImageRefSchema.optional(),
  /** 한 줄 요약 */
  summary: z.string(),
  face: z.object({
    hair: z.array(GuideItemSchema),
    makeup: z.array(GuideItemSchema), // 남성은 그루밍
    summary: z.string(),
  }),
  outfit: z.object({
    substitutions: z.array(ColorSubstitutionSchema),
    items: z.array(GuideItemSchema),
    summary: z.string(),
  }),
  mood: z.object({
    keywords: z.array(z.string()),
    items: z.array(GuideItemSchema),
    summary: z.string(),
  }),
  /** 연예인 팔레트 ↔ 내 팔레트 매핑 */
  paletteMapping: z.array(z.object({ celeb: NamedColorSchema, mine: NamedColorSchema, deltaE: z.number() })),
  gaps: z.array(GapSchema),
  /** 우선순위 액션 (쉬움→어려움) */
  actions: z.array(
    z.object({
      priority: z.number().int(),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      area: z.enum(['face', 'outfit', 'mood']),
      title: z.string(),
      detail: z.string(),
    }),
  ),
  /** 그대로 따라 하면 안 되는 요소와 대체안 */
  doNotCopy: z.array(z.object({ element: z.string(), reason: z.string(), alternative: z.string() })),
  /**
   * 분석이 제한된 연예인 사진(인물 없음·여러 명 등을 '그래도 분석'으로 강행)으로 만든 경우 그 사유.
   * 있으면 가이드 화면 맨 위에 경고를 띄운다. 이전 가이드에는 없을 수 있다.
   */
  limitations: z.array(z.string()).optional(),
  saved: z.boolean(),
  source: ResultSourceSchema,
  isMock: z.boolean(),
});
export type VibeGuide = z.infer<typeof VibeGuideSchema>;
