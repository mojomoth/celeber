/**
 * AI 공급자 체인의 마감 시간·재시도·오류 분류 (외부 호출 없음, 가짜 fetch + 가짜 타이머).
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEYS = ['CELEBER_FORCE_MOCK', 'CELEBER_AI_PROVIDER', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'CLAUDE_KEY', 'OPENAI_API_KEY', 'OPENAI_KEY', 'CELEBER_OPENAI_MODEL', 'CELEBER_VISION_MODEL'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

/** hang = 응답 헤더 전 무응답(signal은 따름), stall = 200 헤더 뒤 본문 정지(signal 무시), bodyError = 200 헤더 뒤 본문 오류 */
type R = { status: number; json: unknown } | 'hang' | 'stall' | 'bodyError';
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
    if (r === 'stall') return new Response(new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode('{"id":')) }), { status: 200 });
    if (r === 'bodyError') return new Response(new ReadableStream({ start: (c) => c.error(new TypeError('terminated')) }), { status: 200 });
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } });
  }),
);

const env = await import('../src/server/env');
const ai = await import('../src/server/ai');

const Schema = z.object({ m: z.string() });
const ask = () => ai.callVisionStructured({ schema: Schema, mock: { m: 'mock' }, prompt: 't', label: 'limits' });
const openaiOk = (): R => ({ status: 200, json: { model: 'gpt-6.2-sol', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"m":"ok"}' }] }] } });

function setEnv(v: Record<string, string>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, v);
}
/** 가짜 타이머로 결과가 나올 때까지(최대 limitSec) 시간을 흘리고, 흐른 가짜 초를 함께 돌려준다 */
async function runFake<T>(fn: () => Promise<T>, limitSec = 1800): Promise<{ settled: boolean; sec: number; value?: T }> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const t0 = Date.now();
  let settled = false;
  let value: T | undefined;
  const p = fn().then((v) => ((settled = true), (value = v)));
  for (let i = 0; i < limitSec * 4 && !settled; i++) await vi.advanceTimersByTimeAsync(250);
  const sec = (Date.now() - t0) / 1000;
  vi.useRealTimers();
  if (settled) await p;
  return { settled, sec, value };
}

beforeEach(() => {
  env.clearAiBlocks();
  calls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());
afterAll(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('마감 시간', () => {
  it('Anthropic 무응답이면 공급자 마감(90초) 안에 OpenAI로 넘어간다', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'ahang', OPENAI_API_KEY: 'o' });
    routes.anthropic = () => 'hang';
    routes.openai = openaiOk;
    const r = await runFake(ask);
    expect(r.settled).toBe(true);
    expect(r.value).toMatchObject({ source: 'ai', model: 'gpt-6.2-sol' });
    expect(r.sec).toBeLessThanOrEqual(ai.AI_PROVIDER_TIMEOUT_MS / 1000 + 1);
    expect(calls.at(-1)).toBe('openai');
  });
  it('Anthropic이 200 헤더 뒤 본문을 멈춰도 OpenAI로 넘어간다', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'astall', OPENAI_API_KEY: 'o' });
    routes.anthropic = () => 'stall';
    routes.openai = openaiOk;
    const r = await runFake(ask);
    expect(r.settled).toBe(true);
    expect(r.value?.source).toBe('ai');
    expect(calls).toContain('openai');
  });
  it('모든 공급자가 멈추면 체인 마감 안에 Mock으로, 문구는 시간 초과', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'ahang2', OPENAI_API_KEY: 'o' });
    routes.anthropic = () => 'hang';
    routes.openai = () => 'stall';
    const r = await runFake(ask);
    expect(r.settled).toBe(true);
    expect(r.sec).toBeLessThanOrEqual(ai.AI_CHAIN_DEADLINE_MS / 1000);
    expect(r.value).toMatchObject({ source: 'mock' });
    expect(r.value?.warning).toContain('시간 초과');
  });
});

describe('OpenAI 재시도', () => {
  it('마지막 시도 뒤에는 기다리지 않는다 (500 두 번 → 대기 1.5초 한 번)', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = () => ({ status: 500, json: { error: { message: 'boom' } } });
    const r = await runFake(ask);
    expect(calls).toEqual(['openai', 'openai']);
    expect(r.sec).toBeLessThan(2);
  });
  it('200 헤더 뒤 본문 읽기 실패는 "API 오류 200"이 아니라 연결 실패로 표시', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = () => 'bodyError';
    const r = await ask();
    expect(r.source).toBe('mock');
    expect(r.warning).toContain('API 연결 실패');
  });
});

describe('결제·한도 분류', () => {
  it('Anthropic 402 → 차단하고 크레딧 부족으로 표시', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a402' });
    routes.anthropic = () => ({ status: 402, json: { type: 'error', error: { type: 'billing_error', message: 'Your credit balance is too low.' } } });
    const r = await ask();
    expect(r.warning).toContain('API 크레딧 부족');
    expect(env.getAiBlock('anthropic')?.reason).toBe('API 크레딧 부족');
  });
  it('OpenAI 429 type=insufficient_quota(code 다름) → 재시도 없이 차단, 사용 한도 초과로 표시', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = () => ({ status: 429, json: { error: { message: 'quota', type: 'insufficient_quota', code: 'billing_hard_limit_reached' } } });
    const r = await ask();
    expect(calls).toEqual(['openai']);
    expect(r.warning).toContain('API 사용 한도 초과');
    expect(env.getAiBlock('openai')?.reason).toBe('API 사용 한도 초과');
  });
});

describe('describeAiError', () => {
  it('Anthropic 타임아웃은 연결 실패가 아니라 시간 초과', () => {
    expect(ai.describeAiError(new Anthropic.APIConnectionTimeoutError())).toBe('API 응답 시간 초과');
    expect(ai.describeAiError(new Anthropic.APIConnectionError({ message: 'x' }))).toBe('API 연결 실패');
  });
});

describe('설정·차단 사유', () => {
  it('CELEBER_AI_PROVIDER는 대소문자를 가리지 않고, 모르는 값은 경고 후 auto', () => {
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', CELEBER_AI_PROVIDER: ' OpenAI ' });
    expect(env.aiProviderChain().map((p) => p.id)).toEqual(['openai']);
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', CELEBER_AI_PROVIDER: 'gemini-test' });
    expect(env.getEnv().aiProvider).toBe('auto');
    const warnings = vi.mocked(console.warn).mock.calls.flat().join(' ');
    expect(warnings).toContain('CELEBER_AI_PROVIDER');
    expect(warnings).not.toContain('gemini-test');
  });
  it('표준 키 이름을 우선 사용하고 기존 CLAUDE_KEY와 OPENAI_KEY도 지원한다', () => {
    setEnv({ CLAUDE_KEY: 'legacy-claude', OPENAI_KEY: 'legacy-openai' });
    expect(env.getEnv()).toMatchObject({ anthropicApiKey: 'legacy-claude', openaiApiKey: 'legacy-openai' });
    Object.assign(process.env, { CLAUDE_API_KEY: 'claude', OPENAI_API_KEY: 'openai' });
    expect(env.getEnv()).toMatchObject({ anthropicApiKey: 'claude', openaiApiKey: 'openai' });
  });
  it('지정한 공급자의 키가 없으면 서버 로그에 경고', () => {
    setEnv({ ANTHROPIC_API_KEY: 'a', CELEBER_AI_PROVIDER: 'openai' });
    expect(env.aiProviderChain()).toEqual([]);
    expect(vi.mocked(console.warn).mock.calls.flat().join(' ')).toContain('OPENAI_API_KEY');
  });
  it('모든 공급자가 막히면 공급자별 사유를 합친다', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' });
    env.setAiBlock('API 사용 한도 초과', undefined, 'anthropic');
    env.setAiBlock('API 키 인증 실패', undefined, 'openai');
    const reason = env.getCapabilities().aiBlockedReason;
    expect(reason).toContain('API 사용 한도 초과');
    expect(reason).toContain('API 키 인증 실패');
    const r = await ask();
    expect(r.warning).toContain('API 키 인증 실패');
    expect(calls).toEqual([]);
  });
  it('앞 공급자를 기다리는 동안 다른 요청이 차단한 공급자는 건너뛴다', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'awaiting-provider', OPENAI_API_KEY: 'o' });
    routes.anthropic = () => {
      env.setAiBlock('API 사용 한도 초과', undefined, 'openai');
      return { status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'bad request' } } };
    };
    routes.openai = openaiOk;
    expect((await ask()).source).toBe('mock');
    expect(calls).toEqual(['anthropic']);
  });
});

describe('로그·스키마', () => {
  it('서버 로그에서 upstream 오류의 키 모양 문자열을 가린다', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = () => ({ status: 401, json: { error: { message: 'Incorrect API key provided: sk-proj-abcDEF123_xyz-789.', code: 'invalid_api_key' } } });
    await ask();
    const logged = vi.mocked(console.error).mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain('sk-proj-abcDEF123');
    expect(logged).toContain('sk-***');
  });
  it('필드 이름이 properties여도 strict를 유지한다', () => {
    const s = betaZodOutputFormat(z.object({ properties: z.string(), n: z.number() }) as never).schema;
    expect(ai.isOpenAiStrictSchema(s)).toBe(true);
    const opt = betaZodOutputFormat(z.object({ properties: z.object({ a: z.string().optional() }) }) as never).schema;
    expect(ai.isOpenAiStrictSchema(opt)).toBe(false);
  });
});
