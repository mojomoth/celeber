import { getCapabilities } from '@celeber/core/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 클라이언트가 Mock 여부를 알기 위한 공개 가능한 기능 플래그(키 값은 포함하지 않음). */
export function GET() {
  return Response.json(getCapabilities());
}
