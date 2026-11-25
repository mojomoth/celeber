export class SelfRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export async function fetchSelfJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', ...init });
  } catch {
    throw new Error('연결을 확인하고 다시 시도해 주세요.');
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new SelfRequestError(detail?.error?.message ?? '데이터를 불러오지 못했어요.', response.status, detail?.error?.code);
  }
  return await response.json() as T;
}

export const postOptions = (payload: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});

export class MissingAnalysis extends Error {
  constructor() {
    super('사진을 찍으면 내 분석과 퍼스널컬러를 확인할 수 있어요.');
  }
}
