/** Lens 역이미지 검색용: 서명·만료가 확인된 업로드 이미지 1장 (proxy가 이 경로만 토큰 없이 통과시킨다) */
import { publicImageGET } from '@celeber/core/server/public-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return publicImageGET(req, id);
}
