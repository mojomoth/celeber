import { serveUpload } from '@celeber/core/server/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 업로드/캐시 이미지 서빙: /api/uploads/<id> (모든 앱이 같은 pocs/.data를 공유) */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return serveUpload(id, req);
}
