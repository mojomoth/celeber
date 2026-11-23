/**
 * celeb-vibe 계약: 사진 한 장의 추구미(코디/퍼스널컬러/분위기) 분석.
 * 인물 신원은 판단하지 않는다. celebName은 사용자가 입력한 메타데이터일 뿐이다.
 */
import { z } from 'zod';
import {
  BoxSchema,
  ColorValueSchema,
  ImageRefSchema,
  IsoDateSchema,
  IssueSchema,
  NamedColorSchema,
  ResultSourceSchema,
} from './common';
import { SeasonSchema, ToneSchema, UndertoneSchema } from './personal-color';

export const AnalyzabilityReasonCodeSchema = z.enum([
  'no-person',
  'multiple-people',
  'backlight',
  'occluded',
  'low-resolution',
  'heavy-filter',
  'cropped',
  'face-too-small',
  'extreme-lighting',
  'not-photo', // 일러스트/합성
  'other',
]);

/** 분석 가능성 판정 (먼저 짧게 표시) */
export const AnalyzabilitySchema = z.object({
  analyzable: z.boolean(),
  /** 부분 분석 가능: 예) 코디만 가능, 퍼스널컬러는 조명 때문에 불가 */
  partial: z.object({ outfit: z.boolean(), personalColor: z.boolean(), mood: z.boolean() }),
  personCount: z.number().int(),
  framing: z.enum(['full-body', 'upper-body', 'face', 'unknown']),
  reasons: z.array(IssueSchema.extend({ code: AnalyzabilityReasonCodeSchema })),
});
export type Analyzability = z.infer<typeof AnalyzabilitySchema>;

export const OutfitCategorySchema = z.enum(['outer', 'top', 'bottom', 'dress', 'shoes', 'bag', 'accessory', 'headwear', 'eyewear', 'jewelry']);
export type OutfitCategory = z.infer<typeof OutfitCategorySchema>;
export const OUTFIT_CATEGORY_LABEL_KO: Record<OutfitCategory, string> = {
  outer: '아우터',
  top: '상의',
  bottom: '하의',
  dress: '원피스',
  shoes: '신발',
  bag: '가방',
  accessory: '액세서리',
  headwear: '모자',
  eyewear: '안경',
  jewelry: '주얼리',
};

/** 코디 아이템 한 개 */
export const OutfitItemSchema = z.object({
  category: OutfitCategorySchema,
  /** 종류 (예: '오버핏 트렌치코트') */
  name: z.string(),
  /** 주색 */
  color: NamedColorSchema,
  /** 보조색 (패턴 등) */
  secondaryColors: z.array(NamedColorSchema).optional(),
  material: z.string().optional(), // '울 개버딘'
  fit: z.string().optional(), // '오버핏', '슬림핏'
  pattern: z.string().optional(),
  /** 사진 위 핫스팟 위치 (정규화 bbox) */
  box: BoxSchema.optional(),
  note: z.string().optional(),
});
export type OutfitItem = z.infer<typeof OutfitItemSchema>;

/** 사진 속 인물의 퍼스널컬러 추정 */
export const VibePersonalColorSchema = z.object({
  /** 브라우저 FaceLandmarker로 피부 ROI를 측정했으면 true */
  measured: z.boolean(),
  skin: ColorValueSchema.optional(),
  hair: ColorValueSchema.optional(),
  eyes: ColorValueSchema.optional(),
  season: SeasonSchema.optional(),
  tone: ToneSchema.optional(),
  toneNameKo: z.string().optional(), // '여름 쿨 뮤트'
  undertone: UndertoneSchema.optional(),
  /** 웜/쿨/명도/채도/대비 축 (0..100) — 갭 비교용 */
  axes: z
    .object({ warmth: z.number(), value: z.number(), chroma: z.number(), contrast: z.number(), clarity: z.number() })
    .optional(),
  /** 0..1 */
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  /** 사진 조명/보정 한계 */
  lightingCaveat: z.string(),
});
export type VibePersonalColor = z.infer<typeof VibePersonalColorSchema>;

/** vibe_analyses 테이블 */
export const VibeAnalysisSchema = z.object({
  id: z.string(),
  version: z.literal(1),
  createdAt: IsoDateSchema,
  image: ImageRefSchema,
  /** 사용자가 입력/선택한 인물 이름 (메타데이터) */
  celebName: z.string().optional(),
  /** search-celeb celebs.id (있으면) */
  celebId: z.string().optional(),
  /** search-celeb celeb_images.id (있으면) */
  celebImageId: z.string().optional(),
  analyzability: AnalyzabilitySchema,
  outfit: z.object({
    items: z.array(OutfitItemSchema),
    styleKeywords: z.array(z.string()), // ['미니멀', '클래식']
    silhouette: z.string(), // 'I라인, 상체 볼륨 + 슬림 하의'
    summary: z.string(),
  }),
  personalColor: VibePersonalColorSchema,
  mood: z.object({
    keywords: z.array(z.string()),
    firstImpression: z.string(),
    /** 이미지 레퍼런스 단어 (예: '파리 아침 카페', '90년대 미니멀') */
    references: z.array(z.string()),
  }),
  /**
   * 사진 속 인물의 체형 비율 추정 (전신 사진 + PoseLandmarker 측정 가능 시). 갭 비교(body-ratio)용.
   * 측정 못 하면 생략 → VibeGuide gaps의 body-ratio는 unavailable.
   */
  body: z
    .object({
      measured: z.boolean(),
      headsTall: z.number().optional(),
      upperToLower: z.number().optional(),
      legToHeight: z.number().optional(),
      shoulderToHip: z.number().optional(),
      /** 체형 라벨 (예: '역삼각형') */
      frameLabel: z.string().optional(),
      notes: z.array(z.string()),
    })
    .optional(),
  palette: z.object({
    main: z.array(NamedColorSchema), // 주조색
    sub: z.array(NamedColorSchema), // 보조색
    accent: z.array(NamedColorSchema), // 포인트색
  }),
  /** 룩 이름 (저장 목록 표시: 썸네일 · 이름 · 룩 이름) */
  lookName: z.string(),
  source: ResultSourceSchema,
  isMock: z.boolean(),
  model: z.string().optional(),
});
export type VibeAnalysis = z.infer<typeof VibeAnalysisSchema>;
