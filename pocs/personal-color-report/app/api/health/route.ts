import { dbHealth } from '@celeber/core/server/db';
import { getCapabilities } from '@celeber/core/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** DB 열기/마이그레이션/쿼리 동작 확인용. */
export function GET() {
  return Response.json({ app: '@celeber/personal-color-report', db: dbHealth(), capabilities: getCapabilities() });
}
