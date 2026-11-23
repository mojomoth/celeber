import { dbHealth } from '@celeber/core/server/db';
import { getCapabilities } from '@celeber/core/server/env';
import { POCS } from '../../../src/pocs';
import { probeAll } from '../../../src/status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 6개 PoC 앱의 실행 상태 + 공유 DB 요약 (허브 화면과 스모크 스크립트가 함께 쓴다) */
export async function GET() {
  const statuses = await probeAll();
  const db = dbHealth();
  return Response.json({
    hub: { capabilities: getCapabilities() },
    db: { ok: db.ok, path: db.path, tables: db.tables },
    pocs: POCS.map((p) => ({ key: p.key, port: p.port, requires: p.requires, ...statuses.find((s) => s.key === p.key) })),
    allRunning: statuses.every((s) => s.running),
  });
}
