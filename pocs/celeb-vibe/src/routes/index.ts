// 호스트 앱이 재노출할 Route Handler 함수들. "@celeber/celeb-vibe/routes"
// 예) 호스트 app/api/vibe/analyze/route.ts:
//   export { analyzePOST as POST } from '@celeber/celeb-vibe/routes';
//   export const runtime = 'nodejs';
// 경로 네임스페이스: /api/vibe/*
//   POST   /api/vibe/precheck                 분석 가능성 사전 판정 (AI 없음)
//   POST   /api/vibe/analyze                  분석 + 저장 → { analysis, warning? }
//   POST   /api/vibe/import-url               URL 이미지 → ImageRef
//   GET    /api/vibe/analyses                 목록 (?celebId=, ?preview=reset)
//   DELETE /api/vibe/analyses                 전체 초기화 (body {confirm:true})
//   GET    /api/vibe/analyses/[id]            상세
//   PATCH  /api/vibe/analyses/[id]            이름/룩 이름 수정
//   DELETE /api/vibe/analyses/[id]            삭제
//   POST   /api/vibe/analyses/[id]/reanalyze  저장된 측정값으로 다시 분석
//   GET    /api/vibe/celeb-images             search-celeb에 저장된 연예인 사진 후보
import 'server-only';
import { z } from 'zod';
import { UnsafeUrlError } from '@celeber/core/server/fetch-image';
import { jsonError, parseJsonBody, withErrors } from '@celeber/core/server/http';
import { AnalyzeRequestSchema, ImportUrlRequestSchema, PatchRequestSchema, PrecheckRequestSchema, importErrorMessage } from '../lib';
import {
  VibeError,
  analyzeVibe,
  deleteAllVibeAnalyses,
  deleteVibeAnalysis,
  getVibeAnalysis,
  importVibeImageFromUrl,
  listCelebImageOptions,
  listVibeAnalyses,
  precheckVibe,
  reanalyzeVibe,
  updateVibeAnalysis,
  vibeResetPreview,
} from '../server';

type IdCtx = { params: Promise<{ id: string }> };

function handleVibeError(e: unknown): Response {
  if (e instanceof VibeError) return jsonError(e.status, e.code, e.message);
  if (e instanceof UnsafeUrlError) return jsonError(400, 'unsafe_url', e.message);
  throw e;
}

export const precheckPOST = withErrors(async (req: Request) => {
  const body = await parseJsonBody(req, PrecheckRequestSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json(await precheckVibe(body.data));
  } catch (e) {
    return handleVibeError(e);
  }
});

export const analyzePOST = withErrors(async (req: Request) => {
  const body = await parseJsonBody(req, AnalyzeRequestSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json(await analyzeVibe(body.data));
  } catch (e) {
    return handleVibeError(e);
  }
});

export const importUrlPOST = withErrors(async (req: Request) => {
  const body = await parseJsonBody(req, ImportUrlRequestSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ image: await importVibeImageFromUrl(body.data.url) });
  } catch (e) {
    if (e instanceof UnsafeUrlError) return jsonError(400, 'unsafe_url', '허용되지 않는 주소입니다 (공개 http/https 이미지 주소만 가능).');
    // 내부 오류 메시지는 서버 로그에만 남기고, 사용자에게는 정해진 문구만 돌려준다
    console.warn('[celeb-vibe] import-url 실패', (e as Error).message);
    return jsonError(400, 'fetch_failed', importErrorMessage(e));
  }
});

export const analysesGET = withErrors(async (req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.get('preview') === 'reset') return Response.json(vibeResetPreview());
  const celebId = url.searchParams.get('celebId') ?? undefined;
  const limit = Math.min(500, Number(url.searchParams.get('limit') ?? 100) || 100);
  return Response.json({ items: listVibeAnalyses({ celebId, limit }) });
});

export const analysesDELETE = withErrors(async (req: Request) => {
  const body = await parseJsonBody(req, z.object({ confirm: z.literal(true) }));
  if (!body.ok) return body.response;
  return Response.json({ deleted: deleteAllVibeAnalyses() });
});

export const analysisGET = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const a = getVibeAnalysis(id);
  return a ? Response.json(a) : jsonError(404, 'not_found', '분석 결과를 찾을 수 없습니다.');
});

export const analysisPATCH = withErrors(async (req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const body = await parseJsonBody(req, PatchRequestSchema);
  if (!body.ok) return body.response;
  const a = updateVibeAnalysis(id, body.data);
  return a ? Response.json(a) : jsonError(404, 'not_found', '분석 결과를 찾을 수 없습니다.');
});

export const analysisDELETE = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  return deleteVibeAnalysis(id) ? Response.json({ deleted: 1 }) : jsonError(404, 'not_found', '분석 결과를 찾을 수 없습니다.');
});

export const reanalyzePOST = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  try {
    return Response.json(await reanalyzeVibe(id));
  } catch (e) {
    return handleVibeError(e);
  }
});

export const celebImagesGET = withErrors(async () => {
  return Response.json({ items: listCelebImageOptions() });
});
