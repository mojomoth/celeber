// 서버 전용 함수 (DB/AI). "@celeber/celeb-vibe-report/server"
// 가이드 생성: 내 퍼스널컬러 리포트(personal_color_reports) × 연예인 추구미 분석(vibe_analyses)
//   → 규칙 계산(색 치환·갭·팔레트 매핑) → Claude 서술(키 없으면 규칙 서술) → VibeGuide 검증 → vibe_guides 저장.
import 'server-only';
import { type PersonalColorReport, type VibeAnalysis, type VibeGuide, VibeGuideSchema } from '@celeber/core/contracts';
import { callVisionStructured } from '@celeber/core/server/ai';
import { bodySessions, newId, nowIso, vibeGuides } from '@celeber/core/server/db';
import { getReport, listReports } from '@celeber/personal-color-report/server';
import { getVibeAnalysis } from '@celeber/celeb-vibe/server';
import {
  type GenerateGuideResponse,
  type GuideContext,
  type GuideResetPreview,
  type GuideSummary,
  type MyBodyRatios,
  type MyReportBrief,
  reportBrief,
  GUIDE_SYSTEM_PROMPT,
  GuideAiSchema,
  buildGuidePrompt,
  buildRuleGuide,
  draftToAi,
  mergeAiGuide,
  sortGuides,
  summarizeGuide,
} from '../lib';

export class GuideHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 리포트의 전신 세션에서 비율 꺼내기 (없거나 측정 실패면 null) */
export function myBodyRatios(report: PersonalColorReport): MyBodyRatios | null {
  if (!report.bodySessionId) return null;
  try {
    const s = bodySessions.get(report.bodySessionId);
    const a = s?.analysis;
    if (!a || a.status !== 'complete' || !a.ratios) return null;
    return {
      headsTall: a.ratios.headsTall,
      legToHeight: a.ratios.legToHeight,
      upperToLower: a.ratios.upperToLower,
      shoulderToHip: a.ratios.shoulderToHip,
      frameLabel: a.frame?.label,
    };
  } catch {
    return null;
  }
}

/** 가이드 계산 입력 불러오기 (없으면 404) */
export function loadGuideContext(reportId: string, vibeAnalysisId: string): GuideContext {
  const report = getReport(reportId);
  if (!report) throw new GuideHttpError(404, 'report_not_found', '퍼스널컬러 리포트를 찾을 수 없습니다. 리포트를 다시 골라 주세요.');
  let vibe: VibeAnalysis | null = null;
  try {
    vibe = getVibeAnalysis(vibeAnalysisId);
  } catch {
    vibe = null;
  }
  if (!vibe) throw new GuideHttpError(404, 'vibe_not_found', '연예인 사진 분석 결과를 찾을 수 없습니다. 사진을 다시 분석해 주세요.');
  return { report, vibe, myBody: myBodyRatios(report) };
}

export interface GenerateGuideInput {
  reportId: string;
  vibeAnalysisId: string;
  skipAi?: boolean;
  saved?: boolean;
  /** 같은 id로 덮어쓰기 (다시 만들기) */
  replaceId?: string;
}

/**
 * 가이드 생성·저장. 키가 없거나 AI가 실패하면 규칙 서술(결정적)로 저장하고 isMock=true.
 * skipAi=true면 source='rules', isMock=false.
 */
export async function generateVibeGuide(input: GenerateGuideInput): Promise<GenerateGuideResponse> {
  const ctx = loadGuideContext(input.reportId, input.vibeAnalysisId);
  const draft = buildRuleGuide(ctx);

  let merged = draft;
  let aiSource: GenerateGuideResponse['aiSource'] = 'skipped';
  let warning: string | undefined;
  if (!input.skipAi) {
    const r = await callVisionStructured({
      schema: GuideAiSchema,
      mock: () => draftToAi(draft),
      system: GUIDE_SYSTEM_PROMPT,
      prompt: buildGuidePrompt(ctx, draft),
      images: [{ uploadId: ctx.vibe.image.uploadId, label: '연예인 룩 사진' }],
      maxTokens: 16000,
      effort: 'medium',
      label: 'celeb-vibe-report/guide',
    });
    aiSource = r.source === 'ai' ? 'ai' : 'mock';
    warning = r.warning ? shortWarning(r.warning) : undefined;
    if (r.source === 'ai') merged = mergeAiGuide(draft, r.data);
  }

  const existing = input.replaceId ? getGuide(input.replaceId) : null;
  const now = nowIso();
  const guide: VibeGuide = VibeGuideSchema.parse({
    ...merged,
    id: existing?.id ?? newId('guide'),
    version: 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    // 사용자가 고친 룩 이름은 다시 만들어도 유지
    lookName: existing && existing.lookName !== ctx.vibe.lookName ? existing.lookName : merged.lookName,
    saved: input.saved ?? existing?.saved ?? true,
    source: aiSource === 'ai' ? 'hybrid' : aiSource === 'mock' ? 'mock' : 'rules',
    isMock: aiSource === 'mock',
  });
  saveGuide(guide, !!existing);
  return { guide, aiSource, warning };
}

/** callVisionStructured 폴백 경고에서 원본 API 오류 JSON을 지우고 한 줄로 */
export function shortWarning(w: string): string {
  const line = w.split('\n')[0] ?? w;
  const cut = line.replace(/\{.*\}/s, '').replace(/request_id\S*/g, '').trim();
  return (cut.length > 160 ? `${cut.slice(0, 157)}…` : cut) || 'AI 서술을 만들지 못해 규칙 서술로 대신했습니다.';
}

function cols(g: VibeGuide) {
  return {
    report_id: g.reportId,
    vibe_analysis_id: g.vibeAnalysisId,
    celeb_id: g.celebId ?? null,
    celeb_name: g.celebName,
    look_name: g.lookName,
    thumbnail_upload_id: g.thumbnail?.uploadId ?? null,
    saved: g.saved,
    is_mock: g.isMock,
  };
}

function saveGuide(g: VibeGuide, exists: boolean) {
  if (exists) vibeGuides.update(g.id, { data: g, cols: cols(g) });
  else vibeGuides.insert({ id: g.id, data: g, cols: cols(g), createdAt: g.createdAt });
}

export async function regenerateVibeGuide(id: string, opts: { skipAi?: boolean } = {}): Promise<GenerateGuideResponse> {
  const g = getGuide(id);
  if (!g) throw new GuideHttpError(404, 'not_found', '가이드를 찾을 수 없습니다.');
  return generateVibeGuide({ reportId: g.reportId, vibeAnalysisId: g.vibeAnalysisId, skipAi: opts.skipAi, replaceId: id });
}

export function getGuide(id: string): VibeGuide | null {
  try {
    return vibeGuides.get(id);
  } catch {
    return null;
  }
}

export function listGuides(opts: { saved?: boolean; limit?: number; reportId?: string } = {}): GuideSummary[] {
  const where: Record<string, string | number | boolean> = {};
  if (opts.saved !== undefined) where.saved = opts.saved;
  if (opts.reportId) where.report_id = opts.reportId;
  const rows = vibeGuides.list({ where: Object.keys(where).length ? (where as never) : undefined, order: 'updated_at DESC', limit: Math.min(200, opts.limit ?? 60) });
  return sortGuides(rows.map((r) => summarizeGuide(r.data)));
}

export function updateGuide(id: string, patch: { saved?: boolean; lookName?: string }): VibeGuide | null {
  const g = getGuide(id);
  if (!g) return null;
  const next: VibeGuide = {
    ...g,
    saved: patch.saved ?? g.saved,
    lookName: patch.lookName?.trim() || g.lookName,
    updatedAt: nowIso(),
  };
  vibeGuides.update(id, { data: next, cols: cols(next) });
  return next;
}

export function deleteGuide(id: string): boolean {
  return vibeGuides.delete(id);
}

/** 초기화 전 확인: 지워질 가이드 (이 PoC 테이블만; 리포트·연예인 분석·사진은 남는다) */
export function guideResetPreview(): GuideResetPreview {
  const rows = vibeGuides.list({ order: 'created_at DESC', limit: 500 });
  return { count: vibeGuides.count(), items: rows.map((r) => `${r.data.celebName} · ${r.data.lookName}`) };
}

export function deleteAllGuides(): number {
  return vibeGuides.deleteAll();
}

/** 리포트 선택 목록: 내 퍼스널컬러 리포트 요약 (전신 포함 여부·베스트 컬러) */
export function listMyReports(limit = 30): MyReportBrief[] {
  const out: MyReportBrief[] = [];
  for (const s of listReports(limit)) {
    const r = getReport(s.id);
    if (r) out.push(reportBrief(r));
  }
  return out;
}

/** personal-color-report 서버 함수 재노출 */
export { listReports, getReport };
export { getVibeAnalysis };

export { myDataPreview, resetMyData, type MyDataPreview } from './my-data';
