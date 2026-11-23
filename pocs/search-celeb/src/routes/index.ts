// 호스트 앱이 재노출할 Route Handler 함수들. "@celeber/search-celeb/routes"
// 경로 네임스페이스: /api/celeb/*  (README의 재노출 표 참고)
//   app/api/celeb/suggest/route.ts           export { suggestGET as GET }
//   app/api/celeb/search/route.ts            export { searchGET as GET }
//   app/api/celeb/identify/route.ts          export { identifyPOST as POST }
//   app/api/celeb/celebs/route.ts            export { celebsGET as GET, celebsPOST as POST }
//   app/api/celeb/celebs/[id]/route.ts       export { celebGET as GET, celebPATCH as PATCH, celebDELETE as DELETE }
//   app/api/celeb/celebs/[id]/images/route.ts export { celebImagesGET as GET, celebImagesPOST as POST }
//   app/api/celeb/images/[id]/route.ts       export { imagePATCH as PATCH }
// 각 호스트 파일에 export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'; 를 직접 선언한다.
import 'server-only';
import { z } from 'zod';
import { CelebCandidateSchema, CelebImageCategorySchema } from '@celeber/core/contracts';
import { jsonError, parseJsonBody, withErrors } from '@celeber/core/server/http';
import { deleteCeleb, getCelebDetail, listCelebSummaries, setCelebSaved, setImageSelected, confirmCandidate } from '../server/celebs';
import { identifyFromPhoto } from '../server/identify';
import { collectCelebImages } from '../server/images';
import { MAX_QUERY_LENGTH, searchCelebCandidates, suggestCelebs } from '../server/search';

type IdCtx = { params: Promise<{ id: string }> };

const qParam = (req: Request) => (new URL(req.url).searchParams.get('q') ?? '').trim();

/** GET /api/celeb/suggest?q= — 자동완성 (DB + 데모 인물) */
export const suggestGET = withErrors(async (req: Request) => Response.json(suggestCelebs(qParam(req))));

/** GET /api/celeb/search?q= — 이름 검색 후보 (썸네일 포함) */
export const searchGET = withErrors(async (req: Request) => {
  const q = qParam(req);
  if (!q) return jsonError(400, 'empty_query', '검색어를 입력해 주세요.');
  if (q.length > MAX_QUERY_LENGTH) return jsonError(400, 'query_too_long', `검색어는 ${MAX_QUERY_LENGTH}자 이내로 입력해 주세요.`);
  return Response.json(await searchCelebCandidates(q));
});

/** POST /api/celeb/identify { uploadId } — 사진 단서로 후보 (얼굴 인식 없음) */
export const identifyPOST = withErrors(async (req: Request) => {
  const body = await parseJsonBody(req, z.object({ uploadId: z.string().min(1) }));
  if (!body.ok) return body.response;
  const r = await identifyFromPhoto(body.data.uploadId);
  return r ? Response.json(r) : jsonError(404, 'not_found', '업로드한 사진을 찾을 수 없습니다.');
});

/** GET /api/celeb/celebs?saved=1&limit= — 인물 목록 (저장/최근) */
export const celebsGET = withErrors(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const saved = sp.get('saved');
  const limit = Math.max(1, Math.min(100, Number(sp.get('limit')) || 30));
  return Response.json({ items: listCelebSummaries({ saved: saved === null ? undefined : saved === '1' || saved === 'true', limit }) });
});

/** POST /api/celeb/celebs { candidate } — 사용자가 확인한 후보를 인물로 확정 */
export const celebsPOST = withErrors(async (req: Request) => {
  const body = await parseJsonBody(req, z.object({ candidate: CelebCandidateSchema }));
  if (!body.ok) return body.response;
  if (!body.data.candidate.name.trim()) return jsonError(400, 'empty_name', '이름이 비어 있습니다.');
  return Response.json({ celeb: await confirmCandidate(body.data.candidate) });
});

/** GET /api/celeb/celebs/[id] — 인물 + 카테고리별 사진 */
export const celebGET = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const d = getCelebDetail(id);
  return d ? Response.json(d) : jsonError(404, 'not_found', '인물을 찾을 수 없습니다.');
});

/** PATCH /api/celeb/celebs/[id] { saved } — 저장 토글 */
export const celebPATCH = withErrors(async (req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const body = await parseJsonBody(req, z.object({ saved: z.boolean() }));
  if (!body.ok) return body.response;
  const c = setCelebSaved(id, body.data.saved);
  return c ? Response.json({ celeb: c }) : jsonError(404, 'not_found', '인물을 찾을 수 없습니다.');
});

/** DELETE /api/celeb/celebs/[id] — 인물과 수집 사진 기록 삭제 (UI는 ConfirmDialog를 거친다) */
export const celebDELETE = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const r = deleteCeleb(id);
  return r.deleted ? Response.json(r) : jsonError(404, 'not_found', '인물을 찾을 수 없습니다.');
});

/** GET /api/celeb/celebs/[id]/images — 저장된 사진(카테고리별) */
export const celebImagesGET = withErrors(async (_req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const d = getCelebDetail(id);
  return d ? Response.json({ celebId: id, images: d.images }) : jsonError(404, 'not_found', '인물을 찾을 수 없습니다.');
});

/** POST /api/celeb/celebs/[id]/images { category, refresh? } — 검색·캐시·판정 후 저장 */
export const celebImagesPOST = withErrors(async (req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const body = await parseJsonBody(req, z.object({ category: CelebImageCategorySchema, refresh: z.boolean().optional() }));
  if (!body.ok) return body.response;
  const r = await collectCelebImages(id, body.data.category, { refresh: body.data.refresh });
  return r ? Response.json(r) : jsonError(404, 'not_found', '인물을 찾을 수 없습니다.');
});

/** PATCH /api/celeb/images/[id] { selected } — 사진 선택 표시 */
export const imagePATCH = withErrors(async (req: Request, ctx: IdCtx) => {
  const { id } = await ctx.params;
  const body = await parseJsonBody(req, z.object({ selected: z.boolean() }));
  if (!body.ok) return body.response;
  const im = setImageSelected(id, body.data.selected);
  return im ? Response.json({ image: im }) : jsonError(404, 'not_found', '사진을 찾을 수 없습니다.');
});
