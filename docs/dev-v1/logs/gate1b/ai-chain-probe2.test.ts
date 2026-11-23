/**
 * Gate 1b 프로브 2: 결제 오류 분류, Anthropic 타임아웃 재시도(가짜 타이머), OpenAI 마지막 시도 뒤 대기. 외부 호출 없음.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const KEYS = ['CELEBER_FORCE_MOCK', 'CELEBER_AI_PROVIDER', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'CELEBER_OPENAI_MODEL', 'CELEBER_VISION_MODEL'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
type R = { status: number; json: unknown } | 'hang';
const routes: { anthropic: () => R; openai: () => R } = { anthropic: () => ({ status: 500, json: {} }), openai: () => ({ status: 500, json: {} }) };
const calls: string[] = [];
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const id = url.includes('anthropic.com') ? 'anthropic' : 'openai';
    calls.push(id);
    const r = routes[id]();
    if (r === 'hang') {
      return new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    }
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } });
  }),
);
const env = await import('../../../../pocs/core/src/server/env');
const ai = await import('../../../../pocs/core/src/server/ai');
const ask = () => ai.callVisionStructured({ schema: z.object({ m: z.string() }), mock: { m: 'mock' }, prompt: 't', label: 'probe2' });
function setEnv(v: Record<string, string>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, v);
}
beforeEach(() => {
  env.clearAiBlocks();
  calls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
});

describe('결제·한도 분류', () => {
  it('Anthropic 402 billing_error → 차단 안 됨, 화면 문구 "API 오류 402"', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a402', OPENAI_API_KEY: 'o' });
    routes.anthropic = () => ({ status: 402, json: { type: 'error', error: { type: 'billing_error', message: 'billing' } } });
    routes.openai = () => ({ status: 401, json: { error: { message: 'x', code: 'invalid_api_key' } } });
    env.setAiBlock('API 키 인증 실패', undefined, 'openai');
    const r = await ask();
    console.log('PROBE2 anthropic402 warning =', r.warning, '| blocked =', !!env.getAiBlock('anthropic'));
    expect(env.getAiBlock('anthropic')).toBeNull();
  });
  it('OpenAI 429 type=insufficient_quota, code 다름 → 2회 호출, 차단 안 됨', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = () => ({ status: 429, json: { error: { message: 'quota', type: 'insufficient_quota', code: 'billing_hard_limit_reached' } } });
    const r = await ask();
    console.log('PROBE2 openai type-only quota calls =', calls.length, '| blocked =', !!env.getAiBlock('openai'), '| warning =', r.warning);
  });
});

describe('타임아웃 누적', () => {
  it('Anthropic 무응답: SDK가 180초 타임아웃을 몇 번 재시도하는지 (가짜 타이머)', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'ahang', OPENAI_API_KEY: 'o' });
    env.setAiBlock('x', undefined, 'openai');
    routes.anthropic = () => 'hang';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t0 = Date.now();
    const p = ask();
    let done = false;
    void p.then(() => (done = true));
    for (let i = 0; i < 2000 && !done; i++) await vi.advanceTimersByTimeAsync(1000);
    const r = await p;
    const sec = Math.round((Date.now() - t0) / 1000);
    vi.useRealTimers();
    console.log('PROBE2 anthropic hang calls =', calls.filter((c) => c === 'anthropic').length, '| simulated sec =', sec, '| warning =', r.warning);
    expect(r.source).toBe('mock');
  });
});
