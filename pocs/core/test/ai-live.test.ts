/**
 * 실제 AI 공급자 호출 확인 (기본 건너뜀, 비용 발생).
 * 실행: set -a; source ../../.env; set +a; CELEBER_LIVE_AI=1 pnpm --filter @celeber/core exec vitest run test/ai-live.test.ts
 * 데모 사진 한 장을 auto 순서(Anthropic → OpenAI → Mock)로 보내 zod 검증을 통과한 'ai' 결과가 오는지 본다.
 */
import fs from 'node:fs';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';

const live = process.env.CELEBER_LIVE_AI === '1';

describe.skipIf(!live)('실제 AI 호출', () => {
  it('데모 전신 사진 → 구조화 결과 (source ai)', { timeout: 300_000 }, async () => {
    delete process.env.CELEBER_FORCE_MOCK;
    const { callVisionStructured } = await import('../src/server/ai');
    const { getCapabilities } = await import('../src/server/env');
    const schema = z.object({
      summary: z.string(),
      items: z.array(z.object({ category: z.string(), name: z.string(), colorName: z.string() })),
      accessories: z.array(z.string()),
    });
    const buffer = fs.readFileSync(new URL('../fixtures/demo-people/look-a.jpg', import.meta.url));
    const t0 = Date.now();
    const r = await callVisionStructured({
      schema,
      mock: { summary: 'mock', items: [], accessories: [] },
      system: '전신 사진에서 입은 옷과 액세서리를 관찰해 기술합니다. category는 아우터/상의/하의/원피스/신발/가방 중 하나.',
      prompt: '이 사진의 코디를 정리해 주세요.',
      images: [{ buffer, label: '전신 사진' }],
      maxTokens: 4000,
      effort: 'low',
      label: 'live-check',
    });
    console.log(JSON.stringify({ ms: Date.now() - t0, source: r.source, model: r.model, warning: r.warning, usage: r.usage, capabilities: getCapabilities(), data: r.data }, null, 2));
    expect(r.source).toBe('ai');
    expect(schema.safeParse(r.data).success).toBe(true);
  });
});
