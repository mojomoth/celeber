/**
 * /api/guide/* 요청 스키마와 클라이언트 API (브라우저·서버 공용).
 * 클라이언트는 apiBase(기본 '')를 앞에 붙여 호출한다.
 */
import { z } from 'zod';
import type { PersonalColorReportSummary, VibeGuide } from '@celeber/core/contracts';
import type { GuideSummary, MyReportBrief } from './types';

const IdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

/** POST /api/guide/generate */
export const GenerateGuideRequestSchema = z.object({
  reportId: IdSchema,
  vibeAnalysisId: IdSchema,
  /** true면 Claude 서술 없이 규칙 서술만 */
  skipAi: z.boolean().optional(),
  /** 저장 목록에 바로 넣을지 (기본 true) */
  saved: z.boolean().optional(),
});
export type GenerateGuideRequest = z.infer<typeof GenerateGuideRequestSchema>;

export interface GenerateGuideResponse {
  guide: VibeGuide;
  aiSource: 'ai' | 'mock' | 'skipped';
  warning?: string;
}

/** PATCH /api/guide/guides/[id]. 모르는 필드(예: 오타 'save')는 400. 바꿀 필드가 없으면 라우트가 400 nothing_to_update */
export const PatchGuideRequestSchema = z
  .object({
    saved: z.boolean().optional(),
    lookName: z.string().trim().min(1).max(40).optional(),
  })
  .strict();
export type PatchGuideRequest = z.infer<typeof PatchGuideRequestSchema>;

export interface GuideListResponse {
  items: GuideSummary[];
}

export interface GuideResetPreview {
  count: number;
  /** 지워질 항목 (이름 · 룩 이름) */
  items: string[];
}

export class GuideApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** 서버 오류 코드 (예: 'report_not_found') */
    readonly code?: string,
  ) {
    super(message);
  }
}

async function asJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: string } } | null)?.error;
    throw new GuideApiError(res.status, err?.message ?? `요청 실패 (${res.status})`, err?.code);
  }
  return body as T;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

/** 클라이언트 API 묶음 */
export function createGuideApi(apiBase = '') {
  const u = (p: string) => `${apiBase}${p}`;
  return {
    generate: async (body: GenerateGuideRequest) => asJson<GenerateGuideResponse>(await fetch(u('/api/guide/generate'), { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })),
    list: async (opts: { saved?: boolean; limit?: number } = {}) => {
      const q = new URLSearchParams();
      if (opts.saved !== undefined) q.set('saved', opts.saved ? '1' : '0');
      if (opts.limit) q.set('limit', String(opts.limit));
      return asJson<GuideListResponse>(await fetch(u(`/api/guide/guides?${q}`), { cache: 'no-store' }));
    },
    get: async (id: string) => asJson<VibeGuide>(await fetch(u(`/api/guide/guides/${encodeURIComponent(id)}`), { cache: 'no-store' })),
    patch: async (id: string, body: PatchGuideRequest) => asJson<VibeGuide>(await fetch(u(`/api/guide/guides/${encodeURIComponent(id)}`), { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) })),
    remove: async (id: string) => asJson<{ deleted: number }>(await fetch(u(`/api/guide/guides/${encodeURIComponent(id)}`), { method: 'DELETE' })),
    regenerate: async (id: string, body: { skipAi?: boolean } = {}) =>
      asJson<GenerateGuideResponse>(await fetch(u(`/api/guide/guides/${encodeURIComponent(id)}/regenerate`), { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })),
    resetPreview: async () => asJson<GuideResetPreview>(await fetch(u('/api/guide/guides?preview=reset'), { cache: 'no-store' })),
    resetAll: async () => asJson<{ deleted: number }>(await fetch(u('/api/guide/guides?confirm=1'), { method: 'DELETE' })),
    /** 내 정보 전체 초기화 (얼굴·전신·리포트·가이드 + 내 사진 파일) */
    myDataPreview: async () => asJson<{ counts: { key: string; label: string; count: number }[]; photos: number; items: string[]; kept: string }>(await fetch(u('/api/guide/my-data'), { cache: 'no-store' })),
    resetMyData: async () => asJson<{ deleted: Record<string, number>; photos: number }>(await fetch(u('/api/guide/my-data?confirm=1'), { method: 'DELETE' })),
    /** 내 퍼스널컬러 리포트 선택 목록 */
    myReports: async (limit = 30) => asJson<{ items: MyReportBrief[] }>(await fetch(u(`/api/guide/reports?limit=${limit}`), { cache: 'no-store' })),
    /** 내 퍼스널컬러 리포트 목록 (personal-color-report 재노출 경로) */
    reports: async (limit = 30) => asJson<{ reports: PersonalColorReportSummary[] }>(await fetch(u(`/api/report/reports?limit=${limit}`), { cache: 'no-store' })),
  };
}
export type GuideApi = ReturnType<typeof createGuideApi>;
