// 호스트 앱이 재노출할 Route Handler 함수들. "@celeber/camera-face/routes"
// 예) 호스트 app/api/face/analyze/route.ts:
//   export { analyzePOST as POST } from '@celeber/camera-face/routes';
//   export const runtime = 'nodejs';
// 경로 네임스페이스: /api/face/*
//   POST   /api/face/environment       환경 사진 분석 (+ 세션 생성)      ← environmentPOST
//   POST   /api/face/analyze           정면/측면 분석 → 세션 완료 저장    ← analyzePOST
//   GET    /api/face/sessions          세션 목록 (?status=complete&limit=20) ← sessionsGET
//   DELETE /api/face/sessions          모든 얼굴 세션 삭제 (?confirm=1)  ← sessionsDELETE
//   GET    /api/face/sessions/<id>     세션 상세                          ← sessionGET
//   DELETE /api/face/sessions/<id>     세션 삭제                          ← sessionDELETE
//   GET    /api/face/latest            최근 완료 FaceAnalysis             ← latestGET
import 'server-only';
import { jsonError, parseJsonBody, withErrors } from '@celeber/core/server/http';
import { AnalyzeRequestSchema, EnvironmentRequestSchema } from '../lib/api';
import {
  FaceHttpError,
  analyzeEnvironmentUpload,
  analyzeFaceCapture,
  deleteAllFaceSessions,
  deleteFaceSession,
  getFaceSession,
  getLatestFaceAnalysis,
  listFaceSessions,
} from '../server';

type IdCtx = { params: Promise<{ id: string }> };

function mapError(e: unknown): Response {
  if (e instanceof FaceHttpError) return jsonError(e.status, e.code, e.message);
  throw e;
}

export const environmentPOST = withErrors(async (req: Request) => {
  const body = await parseJsonBody(req, EnvironmentRequestSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json(await analyzeEnvironmentUpload(body.data));
  } catch (e) {
    return mapError(e);
  }
});

export const analyzePOST = withErrors(async (req: Request) => {
  const body = await parseJsonBody(req, AnalyzeRequestSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json(await analyzeFaceCapture(body.data));
  } catch (e) {
    return mapError(e);
  }
});

export const sessionsGET = withErrors(async (req: Request) => {
  const url = new URL(req.url);
  const s = url.searchParams.get('status');
  const status = s === 'complete' || s === 'in-progress' || s === 'failed' ? s : undefined;
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
  return Response.json({ sessions: listFaceSessions({ status, limit }) });
});

export const sessionsDELETE = withErrors(async (req: Request) => {
  if (new URL(req.url).searchParams.get('confirm') !== '1') return jsonError(400, 'confirm_required', '전체 삭제는 ?confirm=1이 필요합니다.');
  return Response.json({ deleted: deleteAllFaceSessions() });
});

export const sessionGET = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const s = getFaceSession(id);
  if (!s) return jsonError(404, 'not_found', '세션을 찾을 수 없습니다.');
  return Response.json(s);
});

export const sessionDELETE = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  if (!deleteFaceSession(id)) return jsonError(404, 'not_found', '세션을 찾을 수 없습니다.');
  return Response.json({ deleted: 1 });
});

export const latestGET = withErrors(async () => {
  const r = getLatestFaceAnalysis();
  if (!r) return jsonError(404, 'not_found', '완료된 얼굴 분석이 없습니다.');
  return Response.json(r);
});
