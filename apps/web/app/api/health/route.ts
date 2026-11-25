import { getDb } from '@celeber/core/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  let ok = false;
  try {
    getDb().prepare('SELECT 1').get();
    ok = true;
  } catch {
    // 상태 확인에서는 경로나 세부 오류를 외부로 보내지 않는다.
  }
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
