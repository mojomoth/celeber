/**
 * 라운드 2: Codex sol 2차 의견 재현 (외부 호출 없음, 가짜 fetch).
 */
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { afterAll, beforeEach, describe, it, vi } from 'vitest';

const KEYS = ['CELEBER_FORCE_MOCK', 'CELEBER_AI_PROVIDER', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
type H = (init?: RequestInit) => Response | Promise<Response>;
const routes: { anthropic: H; openai: H } = { anthropic: () => new Response('{}', { status: 500 }), openai: () => new Response('{}', { status: 500 }) };
const calls: string[] = [];
vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const id = url.includes('anthropic.com') ? 'anthropic' : 'openai';
  calls.push(id);
  return routes[id](init);
});
const env = await import('../../../../pocs/core/src/server/env');
const ai = await import('../../../../pocs/core/src/server/ai');
const ask = (prompt = 't') => ai.callVisionStructured({ schema: z.object({ m: z.string() }), mock: { m: 'mock' }, prompt, label: 'cx' });
const log = (...a: unknown[]) => process.stdout.write(`R2CX ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function setEnv(v: Record<string, string>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, v);
}
let errSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  env.clearAiBlocks();
  calls.length = 0;
  vi.restoreAllMocks();
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
});

describe('codex 재현', () => {
  it('#3 Anthropic 200 잘못된 JSON 본문에 키 모양 문자열 → 화면 경고', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a' });
    const fake = 'sk-ant-api03-FAKEFAKE_1234';
    routes.anthropic = () => new Response(`not json ${fake}`, { status: 200, headers: { 'content-type': 'application/json' } });
    const r = await ask();
    log('#3 warning has key', (r.warning ?? '').includes(fake), '| log has key', JSON.stringify(errSpy.mock.calls).includes(fake), '| warning', r.warning);
  });
  it('#4 CELEBER_AI_PROVIDER에 키 모양 값', () => {
    const fake = 'sk-proj-FAKE_PROVIDER_VALUE_999';
    setEnv({ CELEBER_AI_PROVIDER: fake, OPENAI_API_KEY: 'o' });
    env.getEnv();
    log('#4 warn has value', JSON.stringify(warnSpy.mock.calls).includes(fake));
  });
  it('#5 키 교체 뒤에도 차단 유지', () => {
    setEnv({ ANTHROPIC_API_KEY: 'old' });
    env.setAiBlock('API 키 인증 실패', undefined, 'anthropic');
    setEnv({ ANTHROPIC_API_KEY: 'new' });
    log('#5 blocked after key change', env.getCapabilities().aiBlockedReason);
  });
  it('#8 OpenAI 503 본문 정지(마지막 시도) → 화면 문구', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    let n = 0;
    routes.openai = () => (++n === 1 ? json(503, {}) : new Response(new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode('{')) }), { status: 503 }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t0 = Date.now();
    let done = false;
    const p = ask().then((r) => ((done = true), r));
    for (let i = 0; i < 3000 && !done; i++) await vi.advanceTimersByTimeAsync(100);
    const sec = (Date.now() - t0) / 1000;
    vi.useRealTimers();
    log('#8 sec', sec, '| calls', calls.length, '|', (await p).warning);
  });
  it('#9 OpenAI 200 status=failed', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = () => json(200, { status: 'failed', error: { code: 'server_error', message: 'x' }, output: [] });
    const r = await ask();
    log('#9 calls', calls.length, '|', r.warning);
  });
  it('#10 루트 배열/유니온 strict', () => {
    for (const [k, s] of [
      ['rootArray', z.array(z.object({ a: z.string() }))],
      ['rootUnion', z.union([z.object({ a: z.string() }), z.object({ b: z.string() })])],
    ] as const) {
      try {
        const sch = betaZodOutputFormat(s as never).schema;
        log('#10', k, 'strict', ai.isOpenAiStrictSchema(sch), JSON.stringify(sch).slice(0, 120));
      } catch (e) {
        log('#10', k, 'betaZodOutputFormat throws', (e as Error).message.slice(0, 100));
      }
    }
  });
  it('#2 A가 OpenAI를 차단한 뒤에도 진행 중 B가 OpenAI 호출', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' });
    const releases: (() => void)[] = [];
    routes.anthropic = (init) => {
      const err = json(400, { type: 'error', error: { type: 'invalid_request_error', message: 'bad' } });
      return String(init?.body ?? '').includes('PROMPT_B') ? new Promise((res) => releases.push(() => res(err))) : err;
    };
    routes.openai = () => json(401, { error: { message: 'bad', type: 'invalid_request_error', code: 'invalid_api_key' } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const A = ask('PROMPT_A');
    const B = ask('PROMPT_B');
    for (let i = 0; i < 100; i++) await vi.advanceTimersByTimeAsync(100);
    const blockedBeforeB = !!env.getAiBlock('openai');
    releases.forEach((r) => r());
    for (let i = 0; i < 100; i++) await vi.advanceTimersByTimeAsync(100);
    vi.useRealTimers();
    await Promise.all([A, B]);
    log('#2 openai blocked before B reached openai', blockedBeforeB, '| openai calls', calls.filter((c) => c === 'openai').length);
  });
});
