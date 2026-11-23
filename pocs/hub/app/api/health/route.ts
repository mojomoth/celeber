import { dbHealth } from '@celeber/core/server/db';
import { getCapabilities } from '@celeber/core/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ app: '@celeber/hub', db: dbHealth(), capabilities: getCapabilities() });
}
