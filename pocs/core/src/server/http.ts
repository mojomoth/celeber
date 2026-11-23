/**
 * Route Handler 공통 HTTP 헬퍼.
 */
import 'server-only';
import type { z } from 'zod';

/** { error: { code, message } } 형태의 오류 응답 */
export function jsonError(status: number, code: string, message: string, details?: unknown): Response {
  return Response.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

/** JSON 본문을 zod로 검증. 실패 시 { ok:false, response } */
export async function parseJsonBody<T>(req: Request, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: jsonError(400, 'invalid_json', '요청 본문이 JSON이 아닙니다.') };
  }
  const r = schema.safeParse(raw);
  if (!r.success) return { ok: false, response: jsonError(400, 'validation_error', '요청 형식이 올바르지 않습니다.', r.error.issues) };
  return { ok: true, data: r.data };
}

/** 예외를 JSON 오류로 감싸는 Route Handler 래퍼 */
export function withErrors<A extends unknown[]>(fn: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error('[celeber] route error', e);
      return jsonError(500, 'internal_error', (e as Error).message || '서버 오류가 발생했습니다.');
    }
  };
}
