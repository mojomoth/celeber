/**
 * Gate 1b AI 공급자 체인 독립 재검증용 프로브 (외부 호출 없음, fetch 가짜).
 * 실행: pnpm exec vitest run --config <scratch>/vitest.probe.config.ts (root=repo, server-only/zod/sdk alias)
 */
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const KEYS = ['CELEBER_FORCE_MOCK', 'CELEBER_AI_PROVIDER', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'CELEBER_OPENAI_MODEL', 'CELEBER_VISION_MODEL'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
type Route = (body: Record<string, unknown>, init?: RequestInit) => { status: number; json: unknown } | Promise<never>;
const routes: { anthropic: Route; openai: Route } = { anthropic: () => ({ status: 500, json: {} }), openai: () => ({ status: 500, json: {} }) };
const calls: string[] = [];
let lastSignal: AbortSignal | null | undefined;
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const id = url.includes('anthropic.com') ? 'anthropic' : url.includes('openai.com') ? 'openai' : 'other';
    calls.push(id);
    if (id === 'other') throw new Error('unexpected');
    if (id === 'openai') lastSignal = init?.signal;
    const raw = init?.body ?? (input instanceof Request ? await input.text() : '{}');
    const r = await routes[id](JSON.parse(String(raw)), init);
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } });
  }),
);
const env = await import('../../../../pocs/core/src/server/env');
const ai = await import('../../../../pocs/core/src/server/ai');

const Schema = z.object({ mood: z.string() });
const ask = (o: Record<string, unknown> = {}) => ai.callVisionStructured({ schema: Schema, mock: { mood: 'mock' }, prompt: 't', label: 'probe', ...o });
const ok: Route = (b) => ({ status: 200, json: { model: b.model, status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"mood":"ok"}' }] }] } });
const antErr = (status: number, type: string, message: string): Route => () => ({ status, json: { type: 'error', error: { type, message } } });
const oaErr = (status: number, code: string | null, message: string, type = 'invalid_request_error'): Route => () => ({ status, json: { error: { message, type, code } } });
function setEnv(v: Record<string, string | undefined>) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, val] of Object.entries(v)) if (val !== undefined) process.env[k] = val;
}
let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  env.clearAiBlocks();
  calls.length = 0;
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
});

describe('CELEBER_AI_PROVIDER 값별', () => {
  const both = { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' };
  it.each([
    [undefined, ['anthropic', 'openai']],
    ['auto', ['anthropic', 'openai']],
    ['openai', ['openai']],
    ['anthropic', ['anthropic']],
    [' openai ', ['openai']],
    ['', ['anthropic', 'openai']],
    ['OpenAI', ['anthropic', 'openai']], // 대소문자 구분 → auto로 조용히 떨어짐
    ['gemini', ['anthropic', 'openai']],
  ])('%j → %j', (v, ids) => {
    setEnv({ ...both, CELEBER_AI_PROVIDER: v });
    expect(env.aiProviderChain().map((p) => p.id)).toEqual(ids);
  });
  it('openai 지정 + OpenAI 키 없음 → 체인 비어 Mock, capabilities는 키 없음으로 표시', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a', CELEBER_AI_PROVIDER: 'openai' });
    const r = await ask();
    expect(r.source).toBe('mock');
    expect(calls).toEqual([]);
    expect(env.getCapabilities()).toMatchObject({ ai: false, aiProvider: null, aiBlockedReason: null });
  });
  it('openai 지정 시 실제 호출 경로도 OpenAI만', async () => {
    setEnv({ ...both, CELEBER_AI_PROVIDER: 'openai' });
    routes.openai = ok;
    const r = await ask();
    expect(r).toMatchObject({ source: 'ai', model: 'gpt-6.2-sol' });
    expect(calls).toEqual(['openai']);
  });
});

describe('오류 분류 (차단 여부)', () => {
  it('Anthropic 401 → 차단, 429 → 차단 안 함', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a401', OPENAI_API_KEY: 'o' });
    routes.anthropic = antErr(401, 'authentication_error', 'invalid x-api-key');
    routes.openai = ok;
    expect((await ask()).source).toBe('ai');
    expect(env.getAiBlock('anthropic')?.reason).toBe('API 키 인증 실패');
  });
  it('Anthropic 400 credit balance too low → 차단 안 됨 (매 요청 재시도)', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'acredit', OPENAI_API_KEY: 'o' });
    routes.anthropic = antErr(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.');
    routes.openai = ok;
    await ask();
    expect(env.getAiBlock('anthropic')).toBeNull();
  });
  it('OpenAI 429 insufficient_quota → 재시도 없이 차단', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = oaErr(429, 'insufficient_quota', 'You exceeded your current quota', 'insufficient_quota');
    const r = await ask();
    expect(calls).toEqual(['openai']);
    expect(r.warning).toContain('API 사용 한도 초과');
    expect(env.getAiBlock('openai')?.reason).toBe('API 사용 한도 초과');
  });
  it('OpenAI 429 rate limit → 1회 재시도, 차단 안 함', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = oaErr(429, 'rate_limit_exceeded', 'Rate limit');
    const r = await ask();
    expect(calls).toEqual(['openai', 'openai']);
    expect(r.warning).toContain('요청 한도 초과');
    expect(env.getAiBlock('openai')).toBeNull();
  });
  it('OpenAI 500 → 1회 재시도 후 mock, 차단 안 함', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = () => ({ status: 500, json: { error: { message: 'server', type: 'server_error', code: null } } });
    await ask();
    expect(calls).toEqual(['openai', 'openai']);
    expect(env.getAiBlock('openai')).toBeNull();
  });
  it('OpenAI 403 → 차단, 404 → 차단 안 함', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = oaErr(403, null, 'forbidden');
    await ask();
    expect(env.getAiBlock('openai')?.reason).toBe('API 권한 없음');
    env.clearAiBlocks();
    routes.openai = oaErr(404, 'model_not_found', 'no model');
    expect((await ask()).warning).toContain('CELEBER_OPENAI_MODEL');
    expect(env.getAiBlock('openai')).toBeNull();
  });
});

describe('타임아웃', () => {
  it('OpenAI fetch에 AbortSignal이 붙고, TimeoutError는 재시도 없이 "응답 시간 초과"로 분류', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    const r = await ask();
    expect(lastSignal).toBeInstanceOf(AbortSignal);
    expect(calls).toEqual(['openai']);
    expect(r.warning).toContain('API 응답 시간 초과');
    expect(env.getAiBlock('openai')).toBeNull();
  });
});

describe('키 노출', () => {
  it('OpenAI 401 메시지에 키가 들어 있어도 화면 warning에는 없음. 서버 로그에는 원문이 남는다', async () => {
    const key = 'sk-probe-SECRETVALUE1234';
    setEnv({ OPENAI_API_KEY: key });
    routes.openai = oaErr(401, 'invalid_api_key', `Incorrect API key provided: ${key}.`);
    const r = await ask();
    expect(r.warning).not.toContain(key);
    expect(JSON.stringify(env.getCapabilities())).not.toContain(key);
    const logged = errSpy.mock.calls.flat().map(String).join(' ');
    // 기록용: 서버 로그에는 upstream 원문 메시지가 그대로 찍힌다
    console.log('PROBE server-log-contains-upstream-key-echo =', logged.includes(key));
  });
});

describe('동시성', () => {
  it('차단 전 동시 5요청은 모두 Anthropic을 친다 (in-flight 중복 제거 없음), 이후 요청은 건너뜀', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'aconc', OPENAI_API_KEY: 'o' });
    routes.anthropic = antErr(400, 'invalid_request_error', 'You have reached your specified API usage limits.');
    routes.openai = ok;
    const rs = await Promise.all(Array.from({ length: 5 }, () => ask()));
    expect(rs.every((r) => r.source === 'ai')).toBe(true);
    console.log('PROBE concurrent anthropic calls =', calls.filter((c) => c === 'anthropic').length);
    calls.length = 0;
    await ask();
    expect(calls).toEqual(['openai']);
  });
  it('setAiBlock은 다른 공급자 차단을 지우지 않는다', () => {
    env.setAiBlock('x', undefined, 'anthropic');
    env.setAiBlock('y', undefined, 'openai');
    expect(env.getAiBlock('anthropic')?.reason).toBe('x');
    expect(env.getAiBlock('openai')?.reason).toBe('y');
  });
});

describe('strict 스키마 판정', () => {
  const strict = (s: z.ZodType) => ai.isOpenAiStrictSchema(betaZodOutputFormat(s as never).schema);
  it('nullable·enum·중첩 배열은 strict', () => {
    expect(strict(z.object({ a: z.string().nullable(), b: z.enum(['x', 'y']), c: z.array(z.object({ d: z.number().int() })) }))).toBe(true);
  });
  it('optional 중첩은 strict 해제', () => {
    expect(strict(z.object({ a: z.array(z.object({ b: z.string().optional() })) }))).toBe(false);
  });
  it('record(동적 키)는 판정 결과 기록', () => {
    const s = betaZodOutputFormat(z.object({ m: z.record(z.string(), z.number()) }) as never).schema;
    console.log('PROBE record schema =', JSON.stringify(s), 'strict =', ai.isOpenAiStrictSchema(s));
  });
  it('필드명이 properties인 경우 판정 결과 기록', () => {
    const s = betaZodOutputFormat(z.object({ properties: z.object({ a: z.string() }) }) as never).schema;
    console.log('PROBE field-named-properties strict =', ai.isOpenAiStrictSchema(s));
  });
});
