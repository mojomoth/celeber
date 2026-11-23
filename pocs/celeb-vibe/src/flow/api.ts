/**
 * 클라이언트 API 헬퍼. apiBase(기본 '')를 앞에 붙여 '/api/vibe/...'와 '/api/uploads'로 보낸다.
 * 호스트 앱은 같은 경로를 재노출해야 한다 (README 참고).
 */
import type { Analyzability, ImageRef, UploadRecord, VibeAnalysis } from '@celeber/core/contracts';
import type { CelebImageOption } from '../lib/summary';
import type { VibeMeasurement } from '../lib/measurement';

async function asJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `요청 실패 (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp';

export async function uploadVibeImage(file: File, apiBase = ''): Promise<ImageRef> {
  if (file.type && !ACCEPT_IMAGES.split(',').includes(file.type)) {
    throw new Error(`${file.type || '이 형식'}은 지원하지 않습니다. JPEG/PNG/WebP 사진을 올려 주세요.`);
  }
  const fd = new FormData();
  fd.append('file', file);
  fd.append('kind', 'vibe');
  const rec = await asJson<UploadRecord>(await fetch(`${apiBase}/api/uploads`, { method: 'POST', body: fd }));
  return { uploadId: rec.id, url: rec.url, width: rec.width ?? undefined, height: rec.height ?? undefined };
}

export async function uploadVibeDataUrl(dataUrl: string, apiBase = ''): Promise<ImageRef> {
  const rec = await asJson<UploadRecord>(
    await fetch(`${apiBase}/api/uploads`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dataUrl, kind: 'vibe' }) }),
  );
  return { uploadId: rec.id, url: rec.url, width: rec.width ?? undefined, height: rec.height ?? undefined };
}

export async function importVibeUrl(url: string, apiBase = ''): Promise<ImageRef> {
  const r = await asJson<{ image: ImageRef }>(await fetch(`${apiBase}/api/vibe/import-url`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) }));
  return r.image;
}

export async function precheckVibeApi(uploadId: string, measurement: VibeMeasurement | undefined, apiBase = ''): Promise<{ analyzability: Analyzability; measured: boolean; measurementDropped?: boolean }> {
  return asJson(await fetch(`${apiBase}/api/vibe/precheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uploadId, measurement }) }));
}

export interface AnalyzeVibeApiInput {
  uploadId: string;
  celebName?: string;
  celebId?: string;
  celebImageId?: string;
  measurement?: VibeMeasurement;
  force?: boolean;
}

export async function analyzeVibeApi(input: AnalyzeVibeApiInput, apiBase = ''): Promise<{ analysis: VibeAnalysis; warning?: string }> {
  return asJson(await fetch(`${apiBase}/api/vibe/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }));
}

export async function reanalyzeVibeApi(id: string, apiBase = ''): Promise<{ analysis: VibeAnalysis; warning?: string }> {
  return asJson(await fetch(`${apiBase}/api/vibe/analyses/${encodeURIComponent(id)}/reanalyze`, { method: 'POST' }));
}

export async function listCelebImageOptionsApi(apiBase = ''): Promise<CelebImageOption[]> {
  const r = await asJson<{ items: CelebImageOption[] }>(await fetch(`${apiBase}/api/vibe/celeb-images`, { cache: 'no-store' }));
  return r.items;
}

export async function deleteVibeApi(id: string, apiBase = ''): Promise<void> {
  await asJson(await fetch(`${apiBase}/api/vibe/analyses/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

export async function deleteAllVibeApi(apiBase = ''): Promise<number> {
  const r = await asJson<{ deleted: number }>(await fetch(`${apiBase}/api/vibe/analyses`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) }));
  return r.deleted;
}

export async function resetPreviewApi(apiBase = ''): Promise<{ analyses: number; referencedByGuides: number }> {
  return asJson(await fetch(`${apiBase}/api/vibe/analyses?preview=reset`, { cache: 'no-store' }));
}

export async function patchVibeApi(id: string, patch: { celebName?: string; lookName?: string }, apiBase = ''): Promise<VibeAnalysis> {
  return asJson(await fetch(`${apiBase}/api/vibe/analyses/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }));
}
