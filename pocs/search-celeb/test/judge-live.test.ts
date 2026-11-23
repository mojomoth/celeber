/**
 * 전신·분석 가능 AI 판정을 실제 공급자로 확인한다 (기본 건너뜀, 비용 발생).
 * 이미지 검색이 Mock이면 앱 흐름에서는 이 판정을 건너뛰므로 따로 부른다.
 *   set -a; source ../../.env; set +a; CELEBER_LIVE_AI=1 pnpm --filter @celeber/search-celeb exec vitest run test/judge-live.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';

const live = process.env.CELEBER_LIVE_AI === '1';
const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../core/fixtures/demo-people');

describe.skipIf(!live)('전신 판정 (실제 AI)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeber-judge-live-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('전신 2장은 전신, 상반신으로 자른 사진은 전신 아님', { timeout: 300_000 }, async () => {
    process.env.CELEBER_DATA_DIR = tmp;
    delete process.env.CELEBER_FORCE_MOCK;
    const { saveUpload } = await import('@celeber/core/server/uploads');
    const { judgeImages } = await import('../src/server/images');

    const a = fs.readFileSync(path.join(DEMO, 'look-a.jpg'));
    const b = fs.readFileSync(path.join(DEMO, 'look-b.jpg'));
    const upper = await sharp(a).extract({ left: 0, top: 0, width: 700, height: 800 }).jpeg().toBuffer();
    const inputs = [a, b, upper];
    const list = await Promise.all(
      inputs.map(async (buf, i) => {
        const record = await saveUpload(buf, { kind: 'celeb-search-cache' });
        const url = `https://example.com/live-${i}.jpg`;
        return { result: { provider: 'naver' as const, imageUrl: url, query: 'live', width: record.width ?? undefined, height: record.height ?? undefined }, record, sourceUrl: url, thumbnailOnly: false };
      }),
    );
    const t0 = Date.now();
    const r = await judgeImages(list, false);
    console.log(JSON.stringify({ ms: Date.now() - t0, origin: r.origin, warning: r.warning, items: r.items }, null, 1));
    expect(r.origin).toBe('ai');
    expect(r.items.map((x) => x.isFullBody)).toEqual([true, true, false]);
    expect(r.items[0].analyzable).toBe(true);
    expect(r.items[0].reasons[0]).toMatchObject({ code: 'ai-judged' });
  });
});
