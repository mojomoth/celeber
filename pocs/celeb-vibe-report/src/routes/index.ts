// 호스트 앱이 재노출할 Route Handler 함수들. "@celeber/celeb-vibe-report/routes"
// 예) 호스트 app/api/guide/generate/route.ts:
//   export { generatePOST as POST } from '@celeber/celeb-vibe-report/routes';
//   export const runtime = 'nodejs';
//   export const dynamic = 'force-dynamic';
// 경로 네임스페이스: /api/guide/*
//   POST   /api/guide/generate                   가이드 생성·저장            ← generatePOST
//   GET    /api/guide/guides?saved=1&limit=      목록 (?preview=reset 초기화 미리보기) ← guidesGET
//   DELETE /api/guide/guides?confirm=1           가이드 전체 삭제(이 테이블만) ← guidesDELETE
//   GET    /api/guide/guides/[id]                상세                         ← guideGET
//   PATCH  /api/guide/guides/[id] {saved?, lookName?}                        ← guidePATCH
//   DELETE /api/guide/guides/[id]                삭제                         ← guideDELETE
//   GET    /api/guide/reports                    내 퍼스널컬러 리포트 선택 목록 ← myReportsGET
//   POST   /api/guide/guides/[id]/regenerate {skipAi?}  같은 id로 다시 만들기 ← regeneratePOST
//   GET    /api/guide/my-data                    내 정보 전체 초기화 미리보기 ← myDataGET
//   DELETE /api/guide/my-data?confirm=1          얼굴·전신·리포트·가이드 + 참조 없는 내 사진 삭제 ← myDataDELETE
import 'server-only';
import { z } from 'zod';
import { jsonError, parseJsonBody, withErrors } from '@celeber/core/server/http';
import { GenerateGuideRequestSchema, PatchGuideRequestSchema } from '../lib/api';
import { GuideHttpError, deleteAllGuides, deleteGuide, generateVibeGuide, getGuide, guideResetPreview, listGuides, listMyReports, myDataPreview, regenerateVibeGuide, resetMyData, updateGuide } from '../server';

type IdCtx = { params: Promise<{ id: string }> };

function handle(e: unknown): Response {
  if (e instanceof GuideHttpError) return jsonError(e.status, e.code, e.message);
  throw e;
}

export const generatePOST = withErrors(async (req: Request) => {
  const body = await parseJsonBody(req, GenerateGuideRequestSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json(await generateVibeGuide(body.data));
  } catch (e) {
    return handle(e);
  }
});

export const guidesGET = withErrors(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  if (sp.get('preview') === 'reset') return Response.json(guideResetPreview());
  const saved = sp.get('saved');
  const limit = Math.max(1, Math.min(200, Number(sp.get('limit')) || 60));
  return Response.json({ items: listGuides({ saved: saved === null ? undefined : saved === '1' || saved === 'true', limit, reportId: sp.get('reportId') ?? undefined }) });
});

export const guidesDELETE = withErrors(async (req: Request) => {
  if (new URL(req.url).searchParams.get('confirm') !== '1') return jsonError(400, 'confirm_required', '전체 삭제는 ?confirm=1이 필요합니다.');
  return Response.json({ deleted: deleteAllGuides() });
});

export const guideGET = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const g = getGuide(id);
  return g ? Response.json(g) : jsonError(404, 'not_found', '가이드를 찾을 수 없습니다.');
});

export const guidePATCH = withErrors(async (req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const body = await parseJsonBody(req, PatchGuideRequestSchema);
  if (!body.ok) return body.response;
  if (body.data.saved === undefined && body.data.lookName === undefined) return jsonError(400, 'nothing_to_update', '바꿀 항목이 없습니다. saved 또는 lookName을 보내 주세요.');
  const g = updateGuide(id, body.data);
  return g ? Response.json(g) : jsonError(404, 'not_found', '가이드를 찾을 수 없습니다.');
});

export const guideDELETE = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  return deleteGuide(id) ? Response.json({ deleted: 1 }) : jsonError(404, 'not_found', '가이드를 찾을 수 없습니다.');
});

export const regeneratePOST = withErrors(async (req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const body = await parseJsonBody(req, z.object({ skipAi: z.boolean().optional() }));
  if (!body.ok) return body.response;
  try {
    return Response.json(await regenerateVibeGuide(id, body.data));
  } catch (e) {
    return handle(e);
  }
});

export const myReportsGET = withErrors(async (req: Request) => {
  const limit = Math.max(1, Math.min(100, Number(new URL(req.url).searchParams.get('limit')) || 30));
  return Response.json({ items: listMyReports(limit) });
});

export const myDataGET = withErrors(async () => Response.json(myDataPreview()));

export const myDataDELETE = withErrors(async (req: Request) => {
  if (new URL(req.url).searchParams.get('confirm') !== '1') return jsonError(400, 'confirm_required', '전체 초기화는 ?confirm=1이 필요합니다.');
  return Response.json(resetMyData());
});
