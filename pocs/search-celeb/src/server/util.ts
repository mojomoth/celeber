import 'server-only';

/** 동시 실행 수를 제한한 map (순서 유지) */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** '/api/uploads/<id>' → id */
export function uploadIdFromUrl(url: string | undefined): string | null {
  const m = url ? /^\/api\/uploads\/([\w-]+)$/.exec(url) : null;
  return m ? m[1] : null;
}

/** AI 폴백 경고를 사용자 표시용 한 줄로 (원본 API 오류 JSON/요청 ID 제거) */
export function shortWarning(w: string | undefined): string | undefined {
  if (!w) return w;
  if (/usage limit/i.test(w)) return 'AI 분석을 사용할 수 없어 데모 데이터를 표시합니다: API 사용 한도 초과';
  const cut = w.replace(/\s*\{.*$/s, '').trim();
  return cut.length > 120 ? `${cut.slice(0, 119)}…` : cut;
}
