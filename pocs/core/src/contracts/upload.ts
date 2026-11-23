/**
 * uploads 테이블 레코드. 업로드/촬영/외부 캐시 이미지 공통.
 */
import { z } from 'zod';
import { IsoDateSchema } from './common';

export const UploadKindSchema = z.enum([
  'face-front',
  'face-side',
  'environment',
  'body',
  'celeb',
  'celeb-search-cache',
  'vibe',
  'drape',
  'other',
]);
export type UploadKind = z.infer<typeof UploadKindSchema>;

export const UploadRecordSchema = z.object({
  id: z.string(),
  createdAt: IsoDateSchema,
  kind: UploadKindSchema,
  mime: z.string(),
  bytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  /** SHA-256 hex (중복 제거/캐시 키) */
  sha256: z.string(),
  /** 외부 원본 URL (캐시인 경우) */
  sourceUrl: z.string().nullable(),
  /** 서빙 경로 '/api/uploads/<id>' */
  url: z.string(),
});
export type UploadRecord = z.infer<typeof UploadRecordSchema>;
