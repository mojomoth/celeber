/**
 * 브라우저용 API 클라이언트. apiBase(기본 '')를 앞에 붙여 '/api/celeb/*'와 '/api/uploads'를 호출한다.
 * 호스트 앱은 같은 경로를 재노출해야 한다 (README '재사용' 참고).
 */
import type { CelebCandidate, CelebImage, CelebImageCategory, CelebProfile, UploadRecord } from '@celeber/core/contracts';
import type { CelebDetailResponse, CelebSummary, CollectImagesResponse, IdentifyResponse, SearchResponse, SuggestResponse } from './types';

export class CelebApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** '/api/...' 상대 URL에 apiBase를 붙인다 (외부·data URL은 그대로) */
export function withBase(apiBase: string, url: string | undefined): string | undefined {
  if (!url) return url;
  return url.startsWith('/') ? `${apiBase}${url}` : url;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* JSON 아님 */
  }
  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: string } } | null)?.error;
    throw new CelebApiError(err?.message ?? `요청 실패 (HTTP ${res.status})`, res.status, err?.code);
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function createCelebApi(apiBase = '') {
  const u = (p: string) => `${apiBase}${p}`;
  return {
    suggest: (q: string, signal?: AbortSignal) => call<SuggestResponse>(u(`/api/celeb/suggest?q=${encodeURIComponent(q)}`), { signal }),
    search: (q: string, signal?: AbortSignal) => call<SearchResponse>(u(`/api/celeb/search?q=${encodeURIComponent(q)}`), { signal }),
    uploadPhoto: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'celeb');
      return call<UploadRecord>(u('/api/uploads'), { method: 'POST', body: fd });
    },
    identify: (uploadId: string) => call<IdentifyResponse>(u('/api/celeb/identify'), json('POST', { uploadId })),
    confirm: (candidate: CelebCandidate) => call<{ celeb: CelebProfile }>(u('/api/celeb/celebs'), json('POST', { candidate })),
    list: (opts: { saved?: boolean; limit?: number } = {}) =>
      call<{ items: CelebSummary[] }>(u(`/api/celeb/celebs?${new URLSearchParams({ ...(opts.saved !== undefined ? { saved: opts.saved ? '1' : '0' } : {}), limit: String(opts.limit ?? 30) })}`)),
    get: (id: string) => call<CelebDetailResponse>(u(`/api/celeb/celebs/${encodeURIComponent(id)}`)),
    setSaved: (id: string, saved: boolean) => call<{ celeb: CelebProfile }>(u(`/api/celeb/celebs/${encodeURIComponent(id)}`), json('PATCH', { saved })),
    remove: (id: string) => call<{ deleted: boolean; images: number }>(u(`/api/celeb/celebs/${encodeURIComponent(id)}`), { method: 'DELETE' }),
    collect: (id: string, category: CelebImageCategory, refresh = false) =>
      call<CollectImagesResponse>(u(`/api/celeb/celebs/${encodeURIComponent(id)}/images`), json('POST', { category, refresh })),
    select: (imageId: string, selected: boolean) => call<{ image: CelebImage }>(u(`/api/celeb/images/${encodeURIComponent(imageId)}`), json('PATCH', { selected })),
  };
}

export type CelebApi = ReturnType<typeof createCelebApi>;
