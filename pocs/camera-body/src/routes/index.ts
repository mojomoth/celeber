// 호스트 앱이 재노출할 Route Handler 함수들. "@celeber/camera-body/routes"
// 예) 호스트 app/api/body/analyze/route.ts:
//   export { analyzePOST as POST } from '@celeber/camera-body/routes';
//   export const runtime = 'nodejs';
// 경로 네임스페이스: /api/body/*
//   POST   /api/body/analyze          측정 결과 저장(+코디 서술)   ← analyzePOST
//   GET    /api/body/sessions         목록                         ← sessionsGET
//   DELETE /api/body/sessions         전체 삭제(이 PoC 테이블만)   ← sessionsDELETE
//   GET    /api/body/sessions/[id]    상세                         ← sessionGET
//   DELETE /api/body/sessions/[id]    삭제                         ← sessionDELETE
//   POST   /api/body/demo             데모(Mock) 세션 생성         ← demoPOST
import 'server-only';
import { jsonError, parseJsonBody, withErrors } from '@celeber/core/server/http';
import { AnalyzeRequestSchema } from '../lib/types';
import { BodyInputError, createDemoBodySession, deleteAllBodySessions, deleteBodySession, getBodySession, listBodySessions, saveBodySession } from '../server';

type IdCtx = { params: Promise<{ id: string }> };

export const analyzePOST = withErrors(async (req: Request) => {
  const body = await parseJsonBody(req, AnalyzeRequestSchema);
  if (!body.ok) return body.response;
  const { analysis, label, outfitColors, describeOutfit } = body.data;
  try {
    return Response.json(await saveBodySession(analysis, { label, outfitColors, describeOutfit }));
  } catch (e) {
    if (e instanceof BodyInputError) return jsonError(400, e.code, e.message);
    throw e;
  }
});

export const sessionsGET = withErrors(async (req: Request) => {
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 50);
  return Response.json({ items: listBodySessions(Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 50) });
});

export const sessionsDELETE = withErrors(async (req: Request) => {
  // 실수 방지: ?confirm=1 필요 (UI는 ConfirmDialog를 거친 뒤 호출)
  if (new URL(req.url).searchParams.get('confirm') !== '1') return jsonError(400, 'confirm_required', '?confirm=1이 필요합니다.');
  return Response.json({ deleted: deleteAllBodySessions() });
});

export const sessionGET = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const r = getBodySession(id);
  if (!r) return jsonError(404, 'not_found', '전신 측정 기록을 찾을 수 없습니다.');
  return Response.json(r);
});

export const sessionDELETE = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  if (!deleteBodySession(id)) return jsonError(404, 'not_found', '전신 측정 기록을 찾을 수 없습니다.');
  return Response.json({ deleted: 1 });
});

export const demoPOST = withErrors(async () => {
  return Response.json(await createDemoBodySession());
});
