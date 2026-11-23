/**
 * GET /api/public-image/<id>?exp&sig — 서명·만료가 확인된 업로드 이미지 1장만 외부(Lens)에 내준다.
 * 터널로 앱을 열어도 다른 경로는 proxy.ts가 막고, 이 경로만 서명으로 통과한다.
 */
import 'server-only';
import { verifyPublicImage } from './access';
import { jsonError } from './http';
import { serveUpload } from './uploads';

export function publicImageGET(req: Request, id: string): Response {
  const url = new URL(req.url);
  if (!verifyPublicImage(id, url.searchParams.get('exp'), url.searchParams.get('sig'))) {
    return jsonError(403, 'invalid_signature', '만료되었거나 서명이 맞지 않는 이미지 주소입니다.');
  }
  const res = serveUpload(id, req);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
