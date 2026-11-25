/**
 * search-celeb 계약: 인물 후보, 프로필, 카테고리별 이미지.
 * 정책: 얼굴 생체 인식으로 신원을 판단하지 않는다. 후보는 이름 검색/역이미지 검색 텍스트/비얼굴 단서로만 만든다.
 */
import { z } from 'zod';
import { ImageRefSchema, IsoDateSchema, IssueSchema } from './common';

/** 후보가 어디서 왔는지 */
export const CandidateSourceSchema = z.enum(['name-search', 'reverse-image', 'photo-text', 'mock']);
export const ImageProviderIdSchema = z.enum(['naver', 'serpapi', 'openai', 'mock']);
export type ImageProviderId = z.infer<typeof ImageProviderIdSchema>;

/** 인물 후보 (사용자가 확인/선택해야 확정) */
export const CelebCandidateSchema = z.object({
  /** 표시 이름 (한국어 우선) */
  name: z.string(),
  nameEn: z.string().optional(),
  /** 직업/그룹 등 짧은 설명 (예: '배우', '가수 · 그룹명') */
  description: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  /** 후보 사진의 공개 출처 페이지 */
  thumbnailSourceUrl: z.httpUrl().optional(),
  thumbnailProvider: ImageProviderIdSchema.optional(),
  source: CandidateSourceSchema,
  /** 후보 순위 점수 0..1 (텍스트 언급 빈도 등) — 얼굴 유사도 아님 */
  score: z.number().min(0).max(1).optional(),
  /** 근거 (예: '역이미지 검색 결과 제목 5건 중 3건에서 언급') */
  evidence: z.array(z.string()),
  /** 참고 링크 */
  externalUrl: z.string().optional(),
});
export type CelebCandidate = z.infer<typeof CelebCandidateSchema>;

/** celebs 테이블 */
export const CelebProfileSchema = z.object({
  id: z.string(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  name: z.string(),
  nameEn: z.string().optional(),
  aliases: z.array(z.string()),
  description: z.string().optional(),
  thumbnail: ImageRefSchema.optional(),
  thumbnailSourceUrl: z.httpUrl().optional(),
  thumbnailProvider: ImageProviderIdSchema.optional(),
  /** 사용자가 '저장'한 인물이면 true */
  saved: z.boolean(),
  source: CandidateSourceSchema,
  isMock: z.boolean(),
});
export type CelebProfile = z.infer<typeof CelebProfileSchema>;

/** 대표(화보/레드카펫) / 최근(최근 행사·공항) / 평소(사복·일상) */
export const CelebImageCategorySchema = z.enum(['signature', 'recent', 'daily']);
export type CelebImageCategory = z.infer<typeof CelebImageCategorySchema>;
export const CELEB_IMAGE_CATEGORY_LABEL_KO: Record<CelebImageCategory, string> = {
  signature: '대표',
  recent: '최근',
  daily: '평소',
};

/** celeb_images 테이블 */
export const CelebImageSchema = z.object({
  id: z.string(),
  celebId: z.string(),
  createdAt: IsoDateSchema,
  category: CelebImageCategorySchema,
  /** 검색에 사용한 쿼리 */
  query: z.string(),
  provider: ImageProviderIdSchema,
  /** 외부 원본 이미지 URL */
  sourceUrl: z.string(),
  /** 이미지가 실린 페이지 URL (출처 링크) */
  pageUrl: z.string().optional(),
  sourceTitle: z.string().optional(),
  /** 서버에 캐시된 사본 (프록시) */
  cached: ImageRefSchema.optional(),
  thumbnailUrl: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  /** 전신 여부 (null = 미판정) */
  isFullBody: z.boolean().nullable(),
  /** 추구미 분석 가능 여부 (null = 미판정) */
  analyzable: z.boolean().nullable(),
  /** 판정 사유 */
  reasons: z.array(IssueSchema),
  /** 사용자가 선택했는지 */
  selected: z.boolean(),
  isMock: z.boolean(),
});
export type CelebImage = z.infer<typeof CelebImageSchema>;
