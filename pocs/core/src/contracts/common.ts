/**
 * 공통 계약 타입. 모든 PoC가 공유하는 기본 형태.
 * 규칙: 저장(SQLite JSON 컬럼)·API 응답 형태는 여기 정의된 zod 스키마로 검증한다.
 */
import { z } from 'zod';

/** '#RRGGBB' (대문자 권장) */
export const HexSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'hex color #RRGGBB');
export type Hex = z.infer<typeof HexSchema>;

/** sRGB 0..255 (실수 허용) */
export const RgbSchema = z.object({ r: z.number(), g: z.number(), b: z.number() });
/** CIELAB(D65) */
export const LabSchema = z.object({ l: z.number(), a: z.number(), b: z.number() });
/** CIE LCh: c=chroma, h=hue angle(도) */
export const LchSchema = z.object({ l: z.number(), c: z.number(), h: z.number() });

export const ItaCategorySchema = z.enum(['very-light', 'light', 'intermediate', 'tan', 'brown', 'dark']);

/**
 * 측정된 색 하나의 완전한 기술. 피부/헤어/눈동자/입술 측정값과 보정 전후 비교에 사용.
 * color 모듈의 describeColor(hex|rgb)로 생성한다.
 */
export const ColorValueSchema = z.object({
  /** '#RRGGBB' */
  hex: HexSchema,
  /** sRGB 0..255 (반올림) */
  rgb: RgbSchema,
  /** CIELAB D65 (소수 1자리) */
  lab: LabSchema,
  /** chroma(C*ab) / hue angle(h_ab, 도) */
  lch: LchSchema,
  /** ITA° (피부색 밝기 지표). 피부 외 색에서는 참고용 */
  ita: z.number(),
  itaCategory: ItaCategorySchema,
  /** 가장 가까운 한국어 색 이름 (피부는 피부 라벨) */
  nameKo: z.string(),
});
export type ColorValue = z.infer<typeof ColorValueSchema>;

/** 이름이 붙은 색 (팔레트/추천/스와치). */
export const NamedColorSchema = z.object({
  hex: HexSchema,
  /** 한국어 색 이름 (예: '더스티 블루') */
  name: z.string(),
  /** 영문 이름 (선택) */
  nameEn: z.string().optional(),
});
export type NamedColor = z.infer<typeof NamedColorSchema>;

/** 정규화 좌표 (이미지 너비/높이 기준 0..1) */
export const Point2Schema = z.object({ x: z.number(), y: z.number() });
export type Point2 = z.infer<typeof Point2Schema>;
/** MediaPipe 랜드마크 형태 (x,y 0..1 정규화, z 상대 깊이, visibility 0..1 선택) */
export const Landmark3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  visibility: z.number().optional(),
});
export type Landmark3 = z.infer<typeof Landmark3Schema>;
/** 정규화 사각형 (0..1) */
export const BoxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type Box = z.infer<typeof BoxSchema>;

/**
 * 저장된 이미지 참조. uploadId는 uploads 테이블 id이며 url은 '/api/uploads/<id>'.
 * 외부 이미지는 sourceUrl을 함께 기록한다.
 */
export const ImageRefSchema = z.object({
  uploadId: z.string(),
  /** 앱 내 서빙 경로 '/api/uploads/<uploadId>' */
  url: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** 외부 원본 URL (검색 이미지 등) */
  sourceUrl: z.string().optional(),
});
export type ImageRef = z.infer<typeof ImageRefSchema>;

/** 결과 출처: 규칙 기반 계산 / AI(Claude) / Mock(키 없음 데모) / 혼합 */
export const ResultSourceSchema = z.enum(['rules', 'ai', 'mock', 'hybrid']);
export type ResultSource = z.infer<typeof ResultSourceSchema>;

/** 경고/사유 한 건 (재촬영 안내, 분석 불가 사유 등) */
export const IssueSchema = z.object({
  /** 기계 판독 코드 (예: 'backlight', 'too-dark', 'multiple-people') */
  code: z.string(),
  /** 사용자에게 보여줄 한국어 한 줄 */
  message: z.string(),
  /** 기본 'warn' */
  severity: z.enum(['info', 'warn', 'error']).optional(),
});
export type Issue = z.infer<typeof IssueSchema>;

/** ISO 8601 문자열 */
export const IsoDateSchema = z.string();

/** 성별/스타일 변형: 리포트 항목명(셔츠/블라우스 등)과 그루밍(수염/메이크업) 분기 */
export const GenderSchema = z.enum(['male', 'female', 'unspecified']);
export type Gender = z.infer<typeof GenderSchema>;

/** API 오류 응답 형태 { error: { code, message } } */
export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
