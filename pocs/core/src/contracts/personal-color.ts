/**
 * 퍼스널컬러 계약: 4계절/12톤, 분류 결과, 리포트(레퍼런스 카드 14개 섹션 + 헤더/성별 변형/신뢰도 근거).
 * 레퍼런스: docs/ui/personal-color-report-guide/navy-men-personal-color-report-card.jpeg
 */
import { z } from 'zod';
import {
  ColorValueSchema,
  GenderSchema,
  HexSchema,
  ImageRefSchema,
  IsoDateSchema,
  NamedColorSchema,
  ResultSourceSchema,
} from './common';

export const SeasonSchema = z.enum(['spring', 'summer', 'autumn', 'winter']);
export type Season = z.infer<typeof SeasonSchema>;

/**
 * 12톤. 표기: <season>-<subtype>
 * spring: light(라이트) bright(브라이트) warm(트루/웜)
 * summer: light(라이트) cool(트루/쿨) mute(뮤트)
 * autumn: mute(뮤트) warm(트루/웜) deep(딥)
 * winter: cool(트루/쿨) bright(브라이트) deep(딥)
 */
export const ToneSchema = z.enum([
  'spring-light',
  'spring-bright',
  'spring-warm',
  'summer-light',
  'summer-cool',
  'summer-mute',
  'autumn-mute',
  'autumn-warm',
  'autumn-deep',
  'winter-cool',
  'winter-bright',
  'winter-deep',
]);
export type Tone = z.infer<typeof ToneSchema>;

export const UndertoneSchema = z.enum(['warm', 'cool', 'neutral']);
export type Undertone = z.infer<typeof UndertoneSchema>;

/** 0..100 축 점수 */
const Score100 = z.number().min(0).max(100);

/** 분류기 축: 웜(0=쿨 100=웜), 명도, 채도, 대비, 청탁(맑음) */
export const ColorAxesSchema = z.object({
  /** 웜 정도 0(쿨)..100(웜) */
  warmth: Score100,
  /** 명도 0(딥)..100(라이트) */
  value: Score100,
  /** 채도 0(뮤트)..100(비비드) */
  chroma: Score100,
  /** 피부-헤어-눈 대비 0(낮음)..100(높음) */
  contrast: Score100,
  /** 청탁 0(탁함)..100(맑음) */
  clarity: Score100,
});
export type ColorAxes = z.infer<typeof ColorAxesSchema>;

/**
 * 결정적 규칙 기반 분류기 출력 (core/personal-color classifyPersonalColor).
 */
export const PersonalColorClassificationSchema = z.object({
  season: SeasonSchema,
  tone: ToneSchema,
  /** 두 번째로 가까운 톤 ('보조 가능 타입') */
  secondaryTone: ToneSchema,
  undertone: UndertoneSchema,
  /** 웜 가능성 % (0..100), cool = 100 - warm */
  warmPercent: Score100,
  coolPercent: Score100,
  axes: ColorAxesSchema,
  /** 12톤 각각의 적합도 (0..1, 합 1, softmax) */
  toneScores: z.record(ToneSchema, z.number()),
  /** 1위-2위 점수 차 기반 분류 확신도 0..1 */
  margin: z.number(),
  /** 판정 근거 (한국어 문장) */
  evidence: z.array(z.string()),
  /** 분류에 쓴 입력 요약 */
  inputs: z.object({
    skinLab: z.object({ l: z.number(), a: z.number(), b: z.number() }),
    hairLab: z.object({ l: z.number(), a: z.number(), b: z.number() }).optional(),
    eyeLab: z.object({ l: z.number(), a: z.number(), b: z.number() }).optional(),
    /** 대비 계산에 헤어/눈 측정값이 없어서 기본값을 썼는지 */
    contrastEstimated: z.boolean(),
  }),
});
export type PersonalColorClassification = z.infer<typeof PersonalColorClassificationSchema>;

/** 금속 톤 */
export const MetalSchema = z.enum(['silver', 'white-gold', 'platinum', 'gold', 'rose-gold', 'champagne-gold', 'bronze', 'gunmetal', 'modern-metal']);
export type Metal = z.infer<typeof MetalSchema>;
export const METAL_LABEL_KO: Record<Metal, string> = {
  silver: '실버',
  'white-gold': '화이트골드',
  platinum: '플래티넘',
  gold: '옐로골드',
  'rose-gold': '로즈골드',
  'champagne-gold': '샴페인골드',
  bronze: '브론즈',
  gunmetal: '건메탈',
  'modern-metal': '모던 메탈',
};

/* ================================================================== 리포트 */

/** 섹션 공통: 섹션 번호와 제목 (성별 변형에 따라 제목이 바뀜) */
const SectionMeta = {
  /** 레퍼런스 카드 번호 1..14 */
  no: z.number().int(),
  title: z.string(),
};

/** 의류 스와치 표현 형태 */
export const SwatchShapeSchema = z.enum(['circle', 'shirt', 'blouse', 'knit', 'tee', 'fabric', 'suit', 'tie', 'scarf', 'hair', 'jacket', 'coat', 'dress']);
export type SwatchShape = z.infer<typeof SwatchShapeSchema>;

/** 스와치 아이템 (색 + 형태 + 짧은 설명) */
export const SwatchItemSchema = z.object({
  color: NamedColorSchema,
  shape: SwatchShapeSchema,
  /** 짧은 보조 설명 (선택) */
  note: z.string().optional(),
});
export type SwatchItem = z.infer<typeof SwatchItemSchema>;

/** 드레이핑 샘플 (정면 사진 + 턱 아래 천 합성) */
export const DrapeSampleSchema = z.object({
  color: NamedColorSchema,
  /** 합성 이미지를 서버에 저장했다면 참조 (클라이언트 canvas 합성만 하면 없음) */
  image: ImageRefSchema.optional(),
  /** 피부와의 조화 점수 0..1 (규칙 계산) */
  harmony: z.number().optional(),
});
export type DrapeSample = z.infer<typeof DrapeSampleSchema>;

/** 아이콘 키 (UI에서 아이콘 매핑) */
export const ReportIconSchema = z.enum([
  'skin',
  'value',
  'chroma',
  'clarity',
  'contrast',
  'keyword',
  'brow',
  'beard',
  'fragrance',
  'base',
  'lip',
  'eye',
  'cheek',
  'hair',
  'nail',
  'check',
]);
export type ReportIcon = z.infer<typeof ReportIconSchema>;

/** 성별/스타일 변형에 따른 섹션 라벨 */
export const ReportVariantSchema = z.object({
  gender: GenderSchema,
  /** 사진 기반 기본값을 사용자가 바꿨는지 */
  userSelected: z.boolean(),
  labels: z.object({
    /** ⑥ 예: '추천 셔츠 색상' / '추천 상의·블라우스 색상' */
    tops: z.string(),
    /** ⑦ 예: '추천 수트 컬러' / '추천 아우터·하의 컬러' */
    outer: z.string(),
    /** ⑧ 예: '넥타이 & 악세서리' / '스카프·주얼리 & 악세서리' */
    accessories: z.string(),
    /** ⑧ 내부 포인트 라벨 예: '넥타이 추천' / '스카프 추천' */
    pointItem: z.string(),
    /** ⑩ 예: '그루밍 제안' / '메이크업·그루밍 제안' */
    grooming: z.string(),
  }),
});
export type ReportVariant = z.infer<typeof ReportVariantSchema>;

/** 신뢰도 산출 요인 (고정값 금지 — 실제 측정 품질에서 계산) */
export const ConfidenceFactorSchema = z.object({
  key: z.enum(['lighting', 'white-balance', 'face-detection', 'skin-uniformity', 'rule-ai-agreement', 'classifier-margin', 'feature-coverage', 'skin-measurement']),
  label: z.string(),
  /** 0..1 */
  score: z.number().min(0).max(1),
  /** 가중치 (합 1로 정규화하여 사용) */
  weight: z.number(),
  /** 근거 (예: '색온도 5,400K 자연광, 경고 없음') */
  detail: z.string(),
});
export type ConfidenceFactor = z.infer<typeof ConfidenceFactorSchema>;

export const ReportConfidenceSchema = z.object({
  /** 0..100 */
  score: Score100,
  grade: z.enum(['high', 'medium', 'low']),
  /** 예: '높은 신뢰도' */
  gradeLabel: z.string(),
  factors: z.array(ConfidenceFactorSchema),
});
export type ReportConfidence = z.infer<typeof ReportConfidenceSchema>;

/**
 * 퍼스널컬러 리포트. 레퍼런스 카드의 헤더 + 14개 섹션 + 하단 면책.
 * personal_color_reports 테이블 data 컬럼에 저장.
 */
export const PersonalColorReportSchema = z.object({
  id: z.string(),
  version: z.literal(1),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  /** 서술 생성 출처: ai(Claude) / rules(템플릿) / mock */
  source: ResultSourceSchema,
  isMock: z.boolean(),
  /** 입력 세션 */
  faceSessionId: z.string(),
  /** 전신 세션 (없으면 null → '전신 사진 추가' 카드) */
  bodySessionId: z.string().nullable(),

  /** 헤더: 제목 / 한 줄 설명 / 메타 박스 */
  header: z.object({
    title: z.string(), // '퍼스널컬러 분석 리포트' (남성/여성 접두 가능)
    subtitle: z.string(), // '업로드한 사진을 기반으로 분석한 결과입니다.'
    analyzedAt: IsoDateSchema, // 분석일
    basis: z.array(z.string()), // 분석 기반: ['정면 얼굴 사진', '환경 사진', '전신 사진']
    tool: z.string(), // 분석 도구: 'CELEBER 규칙 분류기 + Claude 비전' 등
  }),
  variant: ReportVariantSchema,

  /** 업로드한 사진 */
  photos: z.object({
    front: ImageRefSchema,
    side: ImageRefSchema.optional(),
    body: ImageRefSchema.optional(),
    environment: ImageRefSchema.optional(),
    /** 드레이핑 합성용 앵커 (정면 사진 정규화 좌표): 턱끝, 좌우 하악각, 목 너비 */
    drapeAnchor: z
      .object({
        chin: z.object({ x: z.number(), y: z.number() }),
        jawLeft: z.object({ x: z.number(), y: z.number() }),
        jawRight: z.object({ x: z.number(), y: z.number() }),
        /** 얼굴 bbox (정규화) */
        faceBox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
      })
      .optional(),
  }),

  /** 측정값 요약 (리포트 근거 표시용) */
  measurements: z.object({
    skin: ColorValueSchema,
    skinRaw: ColorValueSchema.optional(),
    hair: ColorValueSchema.optional(),
    eyes: ColorValueSchema.optional(),
    lips: ColorValueSchema.optional(),
    environment: z.object({ lightSourceLabel: z.string(), cctK: z.number(), settingLabel: z.string() }).optional(),
  }),
  classification: PersonalColorClassificationSchema,
  /** AI가 독립적으로 판단한 톤 (키 있을 때). 규칙 결과와의 일치도가 신뢰도 요인 */
  aiOpinion: z
    .object({ tone: ToneSchema, undertone: UndertoneSchema, rationale: z.string(), agreesWithRules: z.boolean() })
    .optional(),

  /** ① 첫인상 브리핑 */
  firstImpression: z.object({
    ...SectionMeta,
    bullets: z.array(z.string()).min(1).max(5), // 체크 bullet 3~4개
    hashtags: z.array(z.string()), // '#신뢰감' 형식 (# 포함)
  }),

  /** ② 퍼스널컬러 타입 */
  type: z.object({
    ...SectionMeta,
    season: SeasonSchema,
    tone: ToneSchema,
    nameKo: z.string(), // '여름쿨 뮤트'
    nameEn: z.string(), // 'Summer Cool Muted'
    description: z.string(), // 2~3줄
    /** 강조 블록 배경색 (타입 대표색) */
    accentHex: HexSchema,
    secondary: z.object({ tone: ToneSchema, nameKo: z.string() }), // 보조 가능 타입
  }),

  /** ③ 웜톤 vs 쿨톤 */
  warmCool: z.object({
    ...SectionMeta,
    warmPercent: Score100,
    coolPercent: Score100,
    undertone: UndertoneSchema,
    /** 웜 그라데이션 바 색 (밝은→진한) */
    warmGradient: z.array(HexSchema).min(2),
    coolGradient: z.array(HexSchema).min(2),
    /** 각 바에서 마커 위치 0..1 */
    warmMarker: z.number().min(0).max(1),
    coolMarker: z.number().min(0).max(1),
    /** '분석 포인트' 설명 */
    analysisPoint: z.string(),
    /** 색+텍스트 비교: 웜/쿨 계열을 대었을 때 */
    comparison: z.object({
      warm: z.object({ colors: z.array(NamedColorSchema), text: z.string() }),
      cool: z.object({ colors: z.array(NamedColorSchema), text: z.string() }),
    }),
  }),

  /** ④ 주요 특징 분석: 피부톤/명도/채도/청탁감/대비감/이미지 키워드 */
  features: z.object({
    ...SectionMeta,
    rows: z.array(
      z.object({
        key: z.enum(['skinTone', 'value', 'chroma', 'clarity', 'contrast', 'imageKeywords']),
        icon: ReportIconSchema,
        label: z.string(), // '피부톤'
        value: z.string(), // '밝은 쿨 베이스 (핑크~뉴트럴)'
        /** 0..100 (축 차트용, imageKeywords는 없음) */
        score: Score100.optional(),
      }),
    ),
    axes: ColorAxesSchema,
  }),

  /** ⑤ 톤 컬러 적용 예시 (얼굴 주변 비교) */
  draping: z.object({
    ...SectionMeta,
    best: z.array(DrapeSampleSchema).min(1), // 4개 권장
    worst: z.array(DrapeSampleSchema).min(1), // 4개 권장
    bestCaption: z.string(), // '얼굴이 맑고 깨끗해 보임'
    worstCaption: z.string(), // '칙칙해 보일 수 있음'
  }),

  /** ⑥ 추천 셔츠(상의) 색상 */
  tops: z.object({ ...SectionMeta, items: z.array(SwatchItemSchema), tip: z.string() }),

  /** ⑦ 추천 수트(아우터/하의) 컬러 */
  outer: z.object({ ...SectionMeta, items: z.array(SwatchItemSchema), tip: z.string() }),

  /** ⑧ 넥타이(스카프) & 악세서리 */
  accessories: z.object({
    ...SectionMeta,
    pointLabel: z.string(), // '넥타이 추천'
    pointColors: z.array(SwatchItemSchema),
    itemsLabel: z.string(), // '악세서리 추천'
    items: z.array(
      z.object({
        kind: z.enum(['watch', 'ring', 'necklace', 'earring', 'bracelet', 'glasses', 'belt', 'cufflinks', 'bag']),
        label: z.string(), // '실버 메탈 시계'
        metal: MetalSchema,
      }),
    ),
    metals: z.array(MetalSchema),
    metalSummary: z.string(), // '실버 / 화이트골드 / 모던 메탈'
    avoidMetals: z.array(MetalSchema),
  }),

  /** ⑨ 추천 헤어 컬러 */
  hair: z.object({
    ...SectionMeta,
    intro: z.string(), // '자연광에서 더 세련되고 부드러운 인상을 주는 색'
    items: z.array(z.object({ color: NamedColorSchema, description: z.string() })),
    tip: z.string(), // 피해야 할 헤어 컬러 TIP
    avoid: z.array(NamedColorSchema),
  }),

  /** ⑩ 그루밍 제안 (여성: 메이크업 베이스/립/아이 포함) */
  grooming: z.object({
    ...SectionMeta,
    items: z.array(
      z.object({
        key: z.string(), // 'skin' | 'brow' | 'beard' | 'fragrance' | 'base' | 'lip' | 'eye' ...
        icon: ReportIconSchema,
        label: z.string(), // '피부'
        suggestion: z.string(), // 한 줄 제안
        colors: z.array(NamedColorSchema).optional(), // 립/아이 컬러 등
      }),
    ),
  }),

  /** ⑪ 비추천 스타일 */
  avoidStyles: z.object({
    ...SectionMeta,
    intro: z.string(), // '인상이 무거워지거나 피부가 칙칙해 보일 수 있어요.'
    items: z.array(
      z.object({
        label: z.string(), // '올블랙 코디'
        colors: z.array(NamedColorSchema).min(1),
        shape: SwatchShapeSchema,
        reason: z.string(),
      }),
    ),
  }),

  /** 12 오늘 바로 적용할 포인트 (체크리스트 4개) */
  todayActions: z.object({ ...SectionMeta, items: z.array(z.string()).min(1).max(6) }),

  /** 13 정확도 주의사항 */
  cautions: z.object({ ...SectionMeta, items: z.array(z.string()) }),

  /** 14 분석 신뢰도 (원형 게이지) */
  confidence: ReportConfidenceSchema.extend(SectionMeta),

  /** 전신이 있으면 체형 비율 기반 코디 실루엣 제안 (없으면 null → '전신 사진 추가' 카드) */
  bodyStyling: z
    .object({
      frameLabel: z.string(),
      headsTall: z.number().optional(),
      suggestions: z.array(z.object({ title: z.string(), detail: z.string() })),
      avoid: z.array(z.string()),
    })
    .nullable(),

  /** 하단 면책 문구 */
  disclaimer: z.string(),
});
export type PersonalColorReport = z.infer<typeof PersonalColorReportSchema>;

/** personal_color_reports 목록 행 요약 */
export const PersonalColorReportSummarySchema = z.object({
  id: z.string(),
  createdAt: IsoDateSchema,
  tone: ToneSchema,
  nameKo: z.string(),
  thumbnail: ImageRefSchema.optional(),
  isMock: z.boolean(),
});
export type PersonalColorReportSummary = z.infer<typeof PersonalColorReportSummarySchema>;
