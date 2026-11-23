// 호스트 앱이 재노출할 Route Handler 함수들. "@celeber/personal-color-report/routes"
// 예) 호스트 app/api/report/generate/route.ts:
//   export { generatePOST as POST } from '@celeber/personal-color-report/routes';
//   export const runtime = 'nodejs';
//   export const dynamic = 'force-dynamic';
// 경로 네임스페이스: /api/report/*
//   POST   /api/report/generate          리포트 생성·저장                    ← generatePOST
//   GET    /api/report/inputs            입력 후보 (얼굴/전신 세션)           ← inputsGET
//   GET    /api/report/reports           리포트 목록                          ← reportsGET
//   DELETE /api/report/reports?confirm=1 리포트 전체 삭제 (이 PoC 테이블만)   ← reportsDELETE
//   GET    /api/report/reports/<id>      리포트 상세                          ← reportGET
//   PATCH  /api/report/reports/<id>      성별/스타일 변형 변경 {gender}       ← reportPATCH
//   DELETE /api/report/reports/<id>      리포트 삭제                          ← reportDELETE
//   GET    /api/report/latest            최근 리포트                          ← latestGET
//   POST   /api/uploads                  사진 업로드 (core 핸들러 + 한국어 오류) ← uploadPOST
import 'server-only';
import { jsonError, parseJsonBody, withErrors } from '@celeber/core/server/http';
import { handleUploadPost } from '@celeber/core/server/uploads';
import { GenerateRequestSchema, VariantRequestSchema } from '../lib/api';
import {
  ReportHttpError,
  deleteAllReports,
  deleteReport,
  generatePersonalColorReport,
  getLatestReport,
  getReport,
  listReportInputs,
  listReports,
  updateReportVariant,
} from '../server';

type IdCtx = { params: Promise<{ id: string }> };

export const generatePOST = withErrors(async (req: Request) => {
  const body = await parseJsonBody(req, GenerateRequestSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json(await generatePersonalColorReport(body.data));
  } catch (e) {
    if (e instanceof ReportHttpError) return jsonError(e.status, e.code, e.message);
    throw e;
  }
});

export const inputsGET = withErrors(async () => Response.json(listReportInputs()));

export const reportsGET = withErrors(async (req: Request) => {
  const limit = Math.max(1, Math.min(200, Number(new URL(req.url).searchParams.get('limit')) || 50));
  return Response.json({ reports: listReports(limit) });
});

export const reportsDELETE = withErrors(async (req: Request) => {
  if (new URL(req.url).searchParams.get('confirm') !== '1') return jsonError(400, 'confirm_required', '전체 삭제는 ?confirm=1이 필요합니다.');
  return Response.json({ deleted: deleteAllReports() });
});

export const reportGET = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const r = getReport(id);
  if (!r) return jsonError(404, 'not_found', '리포트를 찾을 수 없습니다.');
  return Response.json(r);
});

export const reportPATCH = withErrors(async (req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const body = await parseJsonBody(req, VariantRequestSchema);
  if (!body.ok) return body.response;
  const r = updateReportVariant(id, body.data.gender);
  if (!r) return jsonError(404, 'not_found', '리포트를 찾을 수 없습니다.');
  return Response.json(r);
});

export const reportDELETE = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  if (!deleteReport(id)) return jsonError(404, 'not_found', '리포트를 찾을 수 없습니다.');
  return Response.json({ deleted: 1 });
});

export const latestGET = withErrors(async () => {
  const r = getLatestReport();
  if (!r) return jsonError(404, 'not_found', '저장된 리포트가 없습니다.');
  return Response.json(r);
});

/**
 * core 업로드 핸들러는 본문 파싱 실패를 런타임 영문 메시지('Failed to parse body as FormData.')로 돌려준다.
 * 사용자에게 그대로 보이지 않도록 한국어 안내로 바꾼다. 다른 오류(413 등)는 그대로 둔다.
 */
export async function koreanUploadError(res: Response): Promise<Response> {
  if (res.status !== 400) return res;
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  const e = body?.error;
  if (e?.code !== 'upload_failed' || /[가-힣]/.test(e.message ?? '')) return res;
  return jsonError(400, 'upload_failed', '사진 파일을 끝까지 읽지 못했습니다. 25MB 이하의 사진으로 다시 시도해 주세요.');
}

export async function uploadPOST(req: Request): Promise<Response> {
  return koreanUploadError(await handleUploadPost(req));
}
