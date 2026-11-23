/**
 * 목록/API 응답용 요약과 요청 스키마 (클라이언트·서버 공용).
 */
import { z } from 'zod';
import type { ImageRef, VibeAnalysis } from '@celeber/core/contracts';
import { VibeMeasurementSchema } from './measurement';

/** POST /api/vibe/analyze 요청 */
export const AnalyzeRequestSchema = z.object({
  uploadId: z.string().min(1),
  celebName: z.string().max(60).optional(),
  celebId: z.string().optional(),
  celebImageId: z.string().optional(),
  measurement: VibeMeasurementSchema.optional(),
  /** 분석 불가 판정이어도 진행 (여러 명 → 가장 큰 인물 기준) */
  force: z.boolean().optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

/** POST /api/vibe/precheck 요청 */
export const PrecheckRequestSchema = z.object({
  uploadId: z.string().min(1),
  measurement: VibeMeasurementSchema.optional(),
});
export type PrecheckRequest = z.infer<typeof PrecheckRequestSchema>;

export const ImportUrlRequestSchema = z.object({ url: z.string().min(4).max(4000) });

/**
 * 이름 수정 폼 → PATCH 본문. 폼을 연 뒤 바뀐 필드만 보낸다.
 * 다시 분석으로 룩 이름이 바뀐 뒤 인물 이름만 고쳐도 룩 이름이 예전 값으로 고정되지 않도록 한다.
 */
export function editPatch(current: { celebName?: string; lookName: string }, form: { celebName: string; lookName: string }): { celebName?: string; lookName?: string } {
  const patch: { celebName?: string; lookName?: string } = {};
  if (form.celebName.trim() !== (current.celebName ?? '').trim()) patch.celebName = form.celebName;
  if (form.lookName.trim() && form.lookName.trim() !== current.lookName.trim()) patch.lookName = form.lookName;
  return patch;
}

export const PatchRequestSchema = z.object({
  celebName: z.string().max(60).optional(),
  lookName: z.string().min(1).max(40).optional(),
});

/** 목록 행 */
export interface VibeAnalysisSummary {
  id: string;
  createdAt: string;
  image: ImageRef;
  celebName?: string;
  lookName: string;
  analyzable: boolean;
  toneNameKo?: string;
  /** 사진 조건 때문에 퍼스널컬러가 참고용(partial.personalColor=false)인지 */
  toneReferenceOnly?: boolean;
  styleKeywords: string[];
  palette: string[];
  isMock: boolean;
  source: VibeAnalysis['source'];
}

export function summarizeVibe(a: VibeAnalysis): VibeAnalysisSummary {
  return {
    id: a.id,
    createdAt: a.createdAt,
    image: a.image,
    celebName: a.celebName,
    lookName: a.lookName,
    analyzable: a.analyzability.analyzable,
    toneNameKo: a.personalColor.toneNameKo,
    toneReferenceOnly: !!a.personalColor.toneNameKo && !a.analyzability.partial.personalColor,
    styleKeywords: a.outfit.styleKeywords,
    palette: [...a.palette.main, ...a.palette.sub, ...a.palette.accent].map((c) => c.hex).slice(0, 5),
    isMock: a.isMock,
    source: a.source,
  };
}

/** search-celeb가 저장한 연예인 사진(분석 후보) */
export interface CelebImageOption {
  id: string;
  celebId: string;
  celebName: string;
  category: string;
  categoryLabel: string;
  image: ImageRef;
  isFullBody: boolean | null;
  analyzable: boolean | null;
  reasons: string[];
  isMock: boolean;
}

/** URL 가져오기 실패 → 고정 사용자 문구 (내부 오류 문자열을 그대로 노출하지 않음) */
export function importErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  if (/시간 초과|timeout|ETIMEDOUT/i.test(msg)) return '이미지를 가져오는 데 시간이 너무 오래 걸렸습니다. 다른 주소로 시도해 주세요.';
  if (/너무 큽니다|too large/i.test(msg)) return '이미지가 너무 큽니다. 더 작은 이미지를 사용해 주세요.';
  if (/형식이 아닙니다|지원하지 않는 이미지 형식/.test(msg)) return '이미지 주소가 아닙니다. 사진 파일을 직접 가리키는 주소(JPEG/PNG/WebP)를 넣어 주세요.';
  if (/HTTP \d+/.test(msg)) return '해당 주소에서 이미지를 받지 못했습니다 (페이지가 없거나 접근이 막혀 있습니다).';
  if (/리다이렉트/.test(msg)) return '주소가 여러 번 다른 곳으로 이동해 이미지를 받지 못했습니다.';
  return '이미지를 가져오지 못했습니다. 주소를 확인하거나 사진을 직접 업로드해 주세요.';
}
