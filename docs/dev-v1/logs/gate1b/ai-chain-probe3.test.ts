/**
 * Gate 1b 프로브 3: Anthropic이 200 헤더 뒤 본문을 멈추면 SDK 180초 타임아웃이 걸리는지 (가짜 타이머, 외부 호출 없음).
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const KEYS = ['CELEBER_FORCE_MOCK', 'CELEBER_AI_PROVIDER', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const calls: string[] = [];
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes('anthropic.com')) {
      calls.push('openai');
      return new Response(JSON.stringify({ model: 'gpt-6.2-sol', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"m":"ok"}' }] }] }), { status: 200 });
    }
    calls.push('anthropic');
    const body = new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode('{"id":')) });
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  }),
);
const env = await import('../../../../pocs/core/src/server/env');
const ai = await import('../../../../pocs/core/src/server/ai');
afterAll(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
});

describe('Anthropic 본문 정지', () => {
  it('가짜 시간 1800초가 지나도 결과(OpenAI/Mock)가 나오는지', async () => {
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, { ANTHROPIC_API_KEY: 'astall', OPENAI_API_KEY: 'o' });
    env.clearAiBlocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let done = false;
    const p = ai.callVisionStructured({ schema: z.object({ m: z.string() }), mock: { m: 'mock' }, prompt: 't', label: 'probe3' }).then((r) => ((done = true), r));
    for (let i = 0; i < 1800 && !done; i++) await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
    console.log('PROBE3 after 1800 simulated sec: settled =', done, '| calls =', calls.join(','));
    expect(done).toBe(false); // 재현: 무기한 대기
  });
});
