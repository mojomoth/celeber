/**
 * Gate 1b AI 공급자 체인 재검증 라운드 2 프로브 (외부 호출 없음, 가짜 fetch + 가짜 타이머).
 * 실행: node_modules/.bin/vitest run --config <scratch>/vitest.probe.config.ts (root=repo, server-only/zod/sdk/sharp alias)
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEYS = ['CELEBER_FORCE_MOCK', 'CELEBER_AI_PROVIDER', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'CELEBER_OPENAI_MODEL', 'CELEBER_VISION_MODEL'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
type R = { status: number; json: unknown } | 'hang' | 'deafHang' | 'stall' | 'bodyError' | 'notJson';
const routes: { anthropic: () => R; openai: () => R } = { anthropic: () => ({ status: 500, json: {} }), openai: () => ({ status: 500, json: {} }) };
const calls: string[] = [];
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const id = url.includes('anthropic.com') ? 'anthropic' : 'openai';
    calls.push(id);
    const r = routes[id]();
    if (r === 'hang') return new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    if (r === 'deafHang') return new Promise<Response>(() => {});
    if (r === 'stall') return new Response(new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode('{"id":')) }), { status: 200 });
    if (r === 'bodyError') return new Response(new ReadableStream({ start: (c) => c.error(new TypeError('terminated')) }), { status: 200 });
    if (r === 'notJson') return new Response('<html>oops', { status: 200 });
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } });
  }),
);
const env = await import('../../../../pocs/core/src/server/env');
const ai = await import('../../../../pocs/core/src/server/ai');

const ask = () => ai.callVisionStructured({ schema: z.object({ m: z.string() }), mock: { m: 'mock' }, prompt: 't', label: 'r2' });
const oaOk = (): R => ({ status: 200, json: { model: 'gpt-6.2-sol', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"m":"ok"}' }] }] } });
function setEnv(v: Record<string, string>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, v);
}
let errSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  env.clearAiBlocks();
  calls.length = 0;
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
});

async function timed(maxSec = 2000) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const t0 = Date.now();
  let done = false;
  const p = ask().then((r) => ((done = true), r));
  for (let i = 0; i < maxSec * 10 && !done; i++) await vi.advanceTimersByTimeAsync(100);
  const sec = (Date.now() - t0) / 1000;
  vi.useRealTimers();
  return { done, sec, r: done ? await p : null };
}
const log = (...a: unknown[]) => process.stdout.write(`R2PROBE ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`);

describe('마감 시간 (major 회귀)', () => {
  it.each([
    ['anthropic hang → openai ok', 'hang', oaOk],
    ['anthropic stall(200 뒤 본문 정지) → openai ok', 'stall', oaOk],
    ['anthropic hang + openai hang', 'hang', () => 'hang' as R],
    ['anthropic stall + openai stall', 'stall', () => 'stall' as R],
    ['anthropic hang + openai 500x2', 'hang', () => ({ status: 500, json: {} }) as R],
    ['anthropic deafHang(signal 무시) + openai deafHang', 'deafHang', () => 'deafHang' as R],
  ] as const)('%s', async (name, a, o) => {
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' });
    routes.anthropic = () => a as R;
    routes.openai = o;
    const { done, sec, r } = await timed(1800);
    log(name, '| settled', done, '| sec', sec, '| calls', calls.join(','), '| source', r?.source, '| warning', r?.warning ?? null);
    expect(done).toBe(true);
    expect(sec).toBeLessThan(300);
  });
});

describe('오류 분류', () => {
  it('OpenAI 500 두 번: 마지막 시도 뒤 대기 없음', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = () => ({ status: 500, json: {} });
    const { sec, r } = await timed(60);
    log('openai 500x2 sec', sec, '| calls', calls.length, '|', r?.warning);
    expect(sec).toBeLessThan(2);
  });
  it('Anthropic 402 → 차단 + 크레딧 부족', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a' });
    routes.anthropic = () => ({ status: 402, json: { type: 'error', error: { type: 'billing_error', message: 'billing' } } });
    const r = await ask();
    log('anthropic402', r.warning, '| blocked', env.getAiBlock('anthropic')?.reason ?? null, '| calls', calls.length);
    expect(env.getAiBlock('anthropic')).not.toBeNull();
  });
  it('OpenAI 429 type=insufficient_quota(code 다름) → 1회, 차단', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = () => ({ status: 429, json: { error: { message: 'q', type: 'insufficient_quota', code: 'billing_hard_limit_reached' } } });
    const r = await ask();
    log('openai type-quota calls', calls.length, '| blocked', env.getAiBlock('openai')?.reason ?? null, '|', r.warning);
    expect(calls.length).toBe(1);
  });
  it('OpenAI 429 rate limit → 재시도 2회, 차단 안 됨', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = () => ({ status: 429, json: { error: { message: 'slow', type: 'requests', code: 'rate_limit_exceeded' } } });
    const { r } = await timed(60);
    log('openai ratelimit calls', calls.length, '| blocked', !!env.getAiBlock('openai'), '|', r?.warning);
  });
  it('Anthropic 400 usage limit → 차단, 다음 요청은 openai만', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' });
    routes.anthropic = () => ({ status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'You have reached your specified API usage limits.' } } });
    routes.openai = oaOk;
    const r1 = await ask();
    const c1 = calls.join(',');
    calls.length = 0;
    const r2 = await ask();
    log('anthropic usage-limit r1', r1.source, c1, '| r2', r2.source, calls.join(','), '| caps', env.getCapabilities());
  });
  it('Anthropic 401 / 529 / 404 분류', async () => {
    for (const [st, type] of [[401, 'authentication_error'], [529, 'overloaded_error'], [404, 'not_found_error'], [403, 'permission_error']] as const) {
      env.clearAiBlocks();
      setEnv({ ANTHROPIC_API_KEY: 'a' });
      routes.anthropic = () => ({ status: st, json: { type: 'error', error: { type, message: 'x' } } });
      const r = await (st === 529 ? timed(300).then((x) => x.r!) : ask());
      log('anthropic', st, r.warning, '| blocked', !!env.getAiBlock('anthropic'));
    }
  });
  it('OpenAI 200 뒤 본문 오류 / JSON 아님', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = () => 'bodyError';
    const a = await ask();
    routes.openai = () => 'notJson';
    const b = await ask();
    log('openai bodyError', a.warning, '| notJson', b.warning);
  });
  it('describeAiError: SDK 타임아웃·사용자 abort', () => {
    log('timeout', ai.describeAiError(new Anthropic.APIConnectionTimeoutError()), '| userAbort', ai.describeAiError(new Anthropic.APIUserAbortError()), '| conn', ai.describeAiError(new Anthropic.APIConnectionError({ message: 'x' })));
  });
});

describe('키 노출', () => {
  it('upstream 오류에 키가 섞여도 화면·로그에 원문 없음', async () => {
    const OK = 'sk-proj-AbC123_def-456XYZ';
    const AK = 'sk-ant-api03-QwErTy_123-zz';
    setEnv({ ANTHROPIC_API_KEY: AK, OPENAI_API_KEY: OK });
    routes.anthropic = () => ({ status: 401, json: { type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${AK}` } } });
    routes.openai = () => ({ status: 401, json: { error: { message: `Incorrect API key provided: ${OK}`, type: 'invalid_request_error', code: 'invalid_api_key' } } });
    const r = await ask();
    const logs = JSON.stringify([...errSpy.mock.calls, ...warnSpy.mock.calls]);
    const caps = JSON.stringify(env.getCapabilities());
    log('key in log', logs.includes(OK) || logs.includes(AK), '| key in warning', JSON.stringify(r).includes(OK) || JSON.stringify(r).includes(AK), '| key in caps', caps.includes(OK) || caps.includes(AK), '| caps', caps);
    expect(logs.includes(OK) || logs.includes(AK)).toBe(false);
  });
});

describe('strict schema', () => {
  it('필드 이름 properties / optional / record / 중첩 배열', () => {
    const conv = (s: z.ZodTypeAny) => betaZodOutputFormat(s as never).schema;
    const cases: Record<string, z.ZodTypeAny> = {
      fieldProperties: z.object({ properties: z.string(), required: z.array(z.string()) }),
      optionalField: z.object({ a: z.string().optional() }),
      nullable: z.object({ a: z.string().nullable() }),
      nestedArr: z.object({ items: z.array(z.object({ x: z.number(), y: z.enum(['a', 'b']) })) }),
      record: z.object({ m: z.record(z.string(), z.string()) }),
    };
    for (const [k, s] of Object.entries(cases)) log('strict', k, ai.isOpenAiStrictSchema(conv(s)), JSON.stringify(conv(s)));
  });
});

describe('CELEBER_AI_PROVIDER 값별', () => {
  const both = { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' };
  it.each([
    [undefined, both],
    ['auto', both],
    ['anthropic', both],
    ['openai', both],
    ['OpenAI', both],
    [' ANTHROPIC ', both],
    ['gpt', both],
    ['openai', { ANTHROPIC_API_KEY: 'a' }],
    ['anthropic', { OPENAI_API_KEY: 'o' }],
  ] as const)('%s %o', async (v, keys) => {
    setEnv({ ...keys, ...(v === undefined ? {} : { CELEBER_AI_PROVIDER: v }) });
    routes.anthropic = () => ({ status: 500, json: { type: 'error', error: { type: 'api_error', message: 'x' } } });
    routes.openai = oaOk;
    const chain = env.aiProviderChain().map((p) => p.id);
    const caps = env.getCapabilities();
    const { r } = await timed(300);
    log('provider', JSON.stringify(v), Object.keys(keys).join('+'), '| chain', chain, '| calls', calls, '| source', r?.source, '| caps.ai', caps.ai, caps.aiProvider, '| warn', warnSpy.mock.calls.map((c) => String(c[0])));
  });
  it('force mock', async () => {
    setEnv({ ...both, CELEBER_FORCE_MOCK: '1' });
    const r = await ask();
    log('forceMock calls', calls, r.source, r.warning, env.getCapabilities());
  });
});

describe('capabilities / 경쟁', () => {
  it('둘 다 차단 → 사유 합침, mockReasons', () => {
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' });
    env.setAiBlock('API 사용 한도 초과', undefined, 'anthropic');
    const mid = env.getCapabilities();
    env.setAiBlock('API 키 인증 실패', undefined, 'openai');
    const c = env.getCapabilities();
    log('caps anthropic-blocked', mid, '| both-blocked', c, '| mockReasons', env.mockReasons(c, ['ai']));
  });
  it('차단 10분 만료', () => {
    setEnv({ ANTHROPIC_API_KEY: 'a' });
    vi.useFakeTimers({ toFake: ['Date'] });
    env.setAiBlock('x', undefined, 'anthropic');
    vi.advanceTimersByTime(10 * 60_000 - 1);
    const before = !!env.getAiBlock('anthropic');
    vi.advanceTimersByTime(2);
    log('block expire before', before, 'after', !!env.getAiBlock('anthropic'));
  });
  it('동시 5건: Anthropic 사용 한도 + OpenAI 인증 실패 동시 차단, 기록 유실 여부', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' });
    routes.anthropic = () => ({ status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'You have reached your specified API usage limits.' } } });
    routes.openai = () => ({ status: 401, json: { error: { message: 'bad', type: 'invalid_request_error', code: 'invalid_api_key' } } });
    const rs = await Promise.all(Array.from({ length: 5 }, ask));
    const a = calls.filter((c) => c === 'anthropic').length;
    const o = calls.filter((c) => c === 'openai').length;
    calls.length = 0;
    const next = await ask();
    log('concurrent anthropic', a, 'openai', o, '| blocks', !!env.getAiBlock('anthropic'), !!env.getAiBlock('openai'), '| next calls', calls, next.warning, '| sources', rs.map((x) => x.source));
  });
});
