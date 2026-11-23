// 서버 전용 함수 (DB/AI). "@celeber/celeb-vibe/server"
// 다른 앱(celeb-vibe-report)이 analyzeVibe 등을 직접 호출할 수 있다.
import 'server-only';
import type { Analyzability, CelebImage, VibeAnalysis } from '@celeber/core/contracts';
import { CELEB_IMAGE_CATEGORY_LABEL_KO } from '@celeber/core/contracts';
import { callVisionStructured } from '@celeber/core/server/ai';
import { celebImages, celebs, kvDelete, kvGet, kvSet, newId, nowIso, vibeAnalyses, vibeGuides } from '@celeber/core/server/db';
import { cacheRemoteImage } from '@celeber/core/server/fetch-image';
import { getUpload, readUploadPixels, toImageRef } from '@celeber/core/server/uploads';
import {
  type CelebImageOption,
  type ServerImageStats,
  type VibeAnalysisSummary,
  type VibeMeasurement,
  VIBE_SYSTEM_PROMPT,
  VibeAiSchema,
  VibeMeasurementSchema,
  assembleVibeAnalysis,
  buildRuleDraft,
  buildVibePrompt,
  draftToAi,
  serverImageStats,
  summarizeVibe,
} from '../lib';

export class VibeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const measureKey = (id: string) => `vibe:measurement:${id}`;
/** 사용자가 직접 고친 값 (다시 분석해도 유지) */
const editKey = (id: string) => `vibe:edit:${id}`;
type UserEdits = { lookName?: string };

/** 클라이언트/다른 앱이 넘긴 측정값 검증. 형식이 틀리면 400 */
function parseMeasurement(m: unknown): VibeMeasurement | undefined {
  if (m === undefined || m === null) return undefined;
  const r = VibeMeasurementSchema.safeParse(m);
  if (!r.success) throw new VibeError(400, 'invalid_measurement', `측정값 형식이 올바르지 않습니다: ${r.error.issues[0]?.path.join('.') ?? ''}`);
  return r.data;
}

/** 업로드 이미지 → 서버 통계 (sharp, 384px) */
export async function computeServerStats(uploadId: string): Promise<ServerImageStats> {
  const rec = getUpload(uploadId);
  if (!rec) throw new VibeError(404, 'upload_not_found', '업로드 이미지를 찾을 수 없습니다.');
  const px = await readUploadPixels(uploadId, 384);
  if (!px) throw new VibeError(404, 'upload_not_found', '업로드 이미지를 읽을 수 없습니다.');
  return serverImageStats(px, { width: rec.width ?? px.width, height: rec.height ?? px.height });
}

/** 분석 가능성 사전 판정 (AI 없이, 빠르게) */
export async function precheckVibe(input: { uploadId: string; measurement?: VibeMeasurement }): Promise<{ analyzability: Analyzability; measured: boolean; measurementDropped: boolean }> {
  const measurement = parseMeasurement(input.measurement);
  const stats = await computeServerStats(input.uploadId);
  const draft = buildRuleDraft(measurement, stats);
  // measured: 판정에 브라우저 측정값을 실제로 썼는지 (검출기 실패로 버렸으면 false)
  return { analyzability: draft.analyzability, measured: !!draft.measurement, measurementDropped: draft.measurementDropped };
}

export interface AnalyzeVibeInput {
  uploadId: string;
  celebName?: string;
  celebId?: string;
  celebImageId?: string;
  /** 브라우저 측정값 (flow의 measureVibeImage). 없으면 서버 통계만으로 규칙 판정 */
  measurement?: VibeMeasurement;
  /** 분석 불가 판정이어도 진행 */
  force?: boolean;
  /** 기존 분석을 같은 id로 덮어쓰기 (다시 분석) */
  replaceId?: string;
}

export interface AnalyzeVibeResult {
  analysis: VibeAnalysis;
  /** AI 폴백 사유 등 */
  warning?: string;
}

/**
 * 사진 한 장 → 추구미 분석 (규칙 측정 + Claude 비전) → SQLite 저장.
 * 키가 없거나 AI 실패 시 규칙 초안으로 결정적 Mock을 만든다 (isMock=true).
 */
export async function analyzeVibe(input: AnalyzeVibeInput): Promise<AnalyzeVibeResult> {
  const rec = getUpload(input.uploadId);
  if (!rec) throw new VibeError(404, 'upload_not_found', '업로드 이미지를 찾을 수 없습니다.');
  const measurement = parseMeasurement(input.measurement);
  const stats = await computeServerStats(input.uploadId);
  const draft = buildRuleDraft(measurement, stats, { force: input.force });

  const ai = await callVisionStructured({
    schema: VibeAiSchema,
    mock: () => draftToAi(draft),
    system: VIBE_SYSTEM_PROMPT,
    prompt: buildVibePrompt(draft, measurement, stats),
    images: [{ uploadId: input.uploadId, label: '분석할 사진' }],
    maxTokens: 16000,
    label: 'celeb-vibe/analyze',
  });

  // celebId/celebImageId가 주어졌으면 이름 메타데이터를 보강 (얼굴로 판단하지 않음)
  let celebName = input.celebName;
  if (!celebName && input.celebId) celebName = celebs.get(input.celebId)?.name;

  const existing = input.replaceId ? vibeAnalyses.get(input.replaceId) : null;
  // 다시 분석하는 동안 기록이 삭제됐으면 새 id로 되살리지 않는다
  if (input.replaceId && !existing) throw new VibeError(404, 'not_found', '분석하는 동안 기록이 삭제됐습니다.');
  const id = existing?.id ?? newId('vibe');
  const analysis = assembleVibeAnalysis({
    id,
    createdAt: existing?.createdAt ?? nowIso(),
    image: toImageRef(rec),
    celebName: celebName ?? existing?.celebName,
    celebId: input.celebId ?? existing?.celebId,
    celebImageId: input.celebImageId ?? existing?.celebImageId,
    draft,
    measurement,
    stats,
    ai: { data: ai.data, source: ai.source, model: ai.model },
  });
  if (existing) {
    // 사용자가 고친 룩 이름은 다시 분석해도 유지
    const edits = kvGet<UserEdits>(editKey(id));
    if (edits?.lookName) analysis.lookName = edits.lookName;
  }

  const cols = {
    celeb_id: analysis.celebId ?? null,
    celeb_name: analysis.celebName ?? null,
    image_upload_id: rec.id,
    analyzable: analysis.analyzability.analyzable,
    look_name: analysis.lookName,
    is_mock: analysis.isMock,
  };
  if (existing) vibeAnalyses.update(id, { data: analysis, cols });
  else vibeAnalyses.insert({ id, data: analysis, cols, createdAt: analysis.createdAt });
  // 측정 없이 '그래도 분석'한 기록도 다시 분석할 때 강행을 유지하도록 force를 함께 저장한다
  if (measurement || input.force) kvSet(measureKey(id), { uploadId: input.uploadId, measurement, force: !!input.force });

  if (analysis.celebImageId) markCelebImage(analysis.celebImageId, analysis.analyzability);
  return { analysis, warning: ai.warning };
}

/** search-celeb의 celeb_images 행에 분석 가능 여부 기록 (다른 사진 선택 안내용) */
function markCelebImage(celebImageId: string, a: Analyzability) {
  try {
    const img = celebImages.get(celebImageId);
    if (!img) return;
    const next: CelebImage = { ...img, analyzable: a.analyzable, reasons: a.reasons.map((r) => ({ code: r.code, message: r.message, severity: r.severity })) };
    celebImages.update(celebImageId, { data: next, cols: { analyzable: a.analyzable } });
  } catch (e) {
    console.warn('[celeb-vibe] celeb_images 갱신 실패', (e as Error).message);
  }
}

/** 저장된 측정값으로 다시 분석 (AI 키가 생긴 뒤 등). 같은 id를 유지한다 */
export async function reanalyzeVibe(id: string): Promise<AnalyzeVibeResult> {
  const prev = vibeAnalyses.get(id);
  if (!prev) throw new VibeError(404, 'not_found', '분석 결과를 찾을 수 없습니다.');
  const saved = kvGet<{ uploadId: string; measurement: unknown; force?: boolean }>(measureKey(id));
  const parsed = saved ? VibeMeasurementSchema.safeParse(saved.measurement) : null;
  return analyzeVibe({
    uploadId: prev.image.uploadId,
    celebName: prev.celebName,
    celebId: prev.celebId,
    celebImageId: prev.celebImageId,
    measurement: parsed?.success ? parsed.data : undefined,
    force: saved?.force,
    replaceId: id,
  });
}

export function listVibeAnalyses(opts: { limit?: number; celebId?: string } = {}): VibeAnalysisSummary[] {
  return vibeAnalyses
    .list({ order: 'created_at DESC', limit: opts.limit ?? 100, where: opts.celebId ? { celeb_id: opts.celebId } : undefined })
    .map((r) => summarizeVibe(r.data));
}

export function getVibeAnalysis(id: string): VibeAnalysis | null {
  return vibeAnalyses.get(id);
}

export function updateVibeAnalysis(id: string, patch: { celebName?: string; lookName?: string }): VibeAnalysis | null {
  const a = vibeAnalyses.get(id);
  if (!a) return null;
  const next: VibeAnalysis = {
    ...a,
    celebName: patch.celebName !== undefined ? patch.celebName.trim() || undefined : a.celebName,
    lookName: patch.lookName?.trim() || a.lookName,
  };
  vibeAnalyses.update(id, { data: next, cols: { celeb_name: next.celebName ?? null, look_name: next.lookName } });
  if (patch.lookName?.trim()) kvSet(editKey(id), { ...(kvGet<UserEdits>(editKey(id)) ?? {}), lookName: next.lookName } satisfies UserEdits);
  return next;
}

/** 삭제 (업로드 파일은 다른 앱이 참조할 수 있어 지우지 않는다) */
export function deleteVibeAnalysis(id: string): boolean {
  kvDelete(measureKey(id));
  kvDelete(editKey(id));
  return vibeAnalyses.delete(id);
}

/** 초기화 전 확인용: 지워질 분석 수와 이를 참조하는 추구미 가이드 수 */
export function vibeResetPreview(): { analyses: number; referencedByGuides: number } {
  const rows = vibeAnalyses.list({ limit: 500 });
  let referenced = 0;
  for (const r of rows) if (vibeGuides.count({ vibe_analysis_id: r.id }) > 0) referenced++;
  return { analyses: vibeAnalyses.count(), referencedByGuides: referenced };
}

export function deleteAllVibeAnalyses(): number {
  for (const r of vibeAnalyses.list({ limit: 500 })) {
    kvDelete(measureKey(r.id));
    kvDelete(editKey(r.id));
  }
  return vibeAnalyses.deleteAll();
}

/** URL 이미지 가져오기 (SSRF 방어 포함) → 업로드 */
export async function importVibeImageFromUrl(url: string) {
  const rec = await cacheRemoteImage(url, { kind: 'vibe' });
  return toImageRef(rec);
}

/** search-celeb가 저장한(캐시된) 연예인 사진 목록 → 분석 후보 */
export function listCelebImageOptions(limit = 60): CelebImageOption[] {
  const rows = celebImages.list({ order: 'created_at DESC', limit });
  const names = new Map<string, string>();
  const out: CelebImageOption[] = [];
  for (const r of rows) {
    const img = r.data;
    if (!img.cached) continue;
    if (!names.has(img.celebId)) names.set(img.celebId, celebs.get(img.celebId)?.name ?? '이름 없음');
    out.push({
      id: img.id,
      celebId: img.celebId,
      celebName: names.get(img.celebId) ?? '',
      category: img.category,
      categoryLabel: CELEB_IMAGE_CATEGORY_LABEL_KO[img.category],
      image: img.cached,
      isFullBody: img.isFullBody,
      analyzable: img.analyzable,
      reasons: img.reasons.map((x) => x.message),
      isMock: img.isMock,
    });
  }
  return out;
}
