/**
 * proxy.ts가 있으면 Next는 요청 본문을 proxyClientMaxBodySize까지만 버퍼링한다(기본 10MB).
 * 업로드 본문 상한(core MAX_UPLOAD_BODY_BYTES)보다 작으면 10~25MB 사진의 FormData 파싱이 실패한다.
 */
import { describe, expect, it } from 'vitest';

const toBytes = (v: string | number): number => {
  if (typeof v === 'number') return v;
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i.exec(v.trim());
  if (!m) throw new Error(`size? ${v}`);
  return Number(m[1]) * { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[m[2].toLowerCase() as 'b']!;
};

describe('next.config', () => {
  it('proxyClientMaxBodySize ≥ 업로드 본문 상한', async () => {
    const { default: config } = await import('../next.config');
    const { MAX_UPLOAD_BODY_BYTES } = await import('@celeber/core/server/uploads');
    const v = config.experimental?.proxyClientMaxBodySize;
    expect(v).toBeDefined();
    expect(toBytes(v!)).toBeGreaterThanOrEqual(MAX_UPLOAD_BODY_BYTES);
  });
});
