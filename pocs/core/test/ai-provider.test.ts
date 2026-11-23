/**
 * AI 공급자 선택과 폴백 (외부 호출 없음): fetch를 가짜로 바꿔 Anthropic → OpenAI → Mock 순서를 확인한다.
 */
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const KEYS = ['CELEBER_FORCE_MOCK', 'CELEBER_AI_PROVIDER', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'CELEBER_OPENAI_MODEL', 'CELEBER_VISION_MODEL'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

type Route = (body: Record<string, unknown>) => { status: number; json: unknown };
const routes: { anthropic: Route; openai: Route } = { anthropic: () => ({ status: 500, json: {} }), openai: () => ({ status: 500, json: {} }) };
const calls: string[] = [];
const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const id = url.includes('anthropic.com') ? 'anthropic' : url.includes('openai.com') ? 'openai' : 'other';
  calls.push(id);
  if (id === 'other') throw new Error(`unexpected fetch ${url}`);
  const raw = init?.body ?? (input instanceof Request ? await input.text() : '{}');
  const r = routes[id](JSON.parse(String(raw)));
  return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } });
});
vi.stubGlobal('fetch', fetchStub);

const env = await import('../src/server/env');
const ai = await import('../src/server/ai');

const Schema = z.object({ mood: z.string(), score: z.number() });
const mock = { mood: '데모', score: 0 };
const ask = (o: Partial<Parameters<typeof ai.callVisionStructured<z.infer<typeof Schema>>>[0]> = {}) =>
  ai.callVisionStructured({ schema: Schema, mock, prompt: '테스트', label: 'test', ...o });

const anthropicLimit: Route = () => ({
  status: 400,
  json: { type: 'error', error: { type: 'invalid_request_error', message: 'You have reached your specified API usage limits.' } },
});
const openaiOk: Route = (body) => ({
  status: 200,
  json: {
    model: body.model,
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ mood: '차분함', score: 7 }) }] }],
    usage: { input_tokens: 10, output_tokens: 5 },
  },
});

function setEnv(v: Record<string, string | undefined>) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, val] of Object.entries(v)) if (val !== undefined) process.env[k] = val;
}

beforeEach(() => {
  env.clearAiBlocks();
  calls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('aiProviderChain', () => {
  it('auto: 키가 있는 공급자를 Anthropic → OpenAI 순서로', () => {
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' });
    expect(env.aiProviderChain().map((p) => `${p.id}:${p.model}`)).toEqual(['anthropic:claude-opus-5-5', 'openai:gpt-6.2-sol']);
    setEnv({ CLAUDE_API_KEY: 'a' });
    expect(env.aiProviderChain().map((p) => p.id)).toEqual(['anthropic']);
    setEnv({ OPENAI_API_KEY: 'o', CELEBER_OPENAI_MODEL: 'gpt-6.2-astra' });
    expect(env.aiProviderChain().map((p) => `${p.id}:${p.model}`)).toEqual(['openai:gpt-6.2-astra']);
  });
  it('CELEBER_AI_PROVIDER로 하나만 고르고, 모르는 값은 auto', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', CELEBER_AI_PROVIDER: 'openai' });
    expect(env.aiProviderChain().map((p) => p.id)).toEqual(['openai']);
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', CELEBER_AI_PROVIDER: 'anthropic' });
    expect(env.aiProviderChain().map((p) => p.id)).toEqual(['anthropic']);
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', CELEBER_AI_PROVIDER: 'gemini' });
    expect(env.getEnv().aiProvider).toBe('auto');
  });
  it('강제 Mock이면 빈 목록', () => {
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', CELEBER_FORCE_MOCK: '1' });
    expect(env.aiProviderChain()).toEqual([]);
    expect(env.getCapabilities()).toMatchObject({ ai: false, aiProvider: null, model: null });
  });
  it('capabilities는 차단되지 않은 첫 공급자를 보여주고, 전부 막히면 사유를 준다', () => {
    setEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' });
    expect(env.getCapabilities()).toMatchObject({ ai: true, aiProvider: 'anthropic', model: 'claude-opus-5-5' });
    env.setAiBlock('API 사용 한도 초과', undefined, 'anthropic');
    expect(env.getCapabilities()).toMatchObject({ ai: true, aiProvider: 'openai', model: 'gpt-6.2-sol', aiBlockedReason: null });
    env.setAiBlock('API 키 인증 실패', undefined, 'openai');
    expect(env.getCapabilities()).toMatchObject({ ai: false, aiProvider: null, aiBlockedReason: 'Anthropic API 사용 한도 초과, OpenAI API 키 인증 실패' });
  });
});

describe('callVisionStructured 폴백', () => {
  it('Anthropic 사용 한도 → OpenAI 결과(source ai), Anthropic은 차단되어 다음 호출에서 건너뜀', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a-limit', OPENAI_API_KEY: 'o' });
    routes.anthropic = anthropicLimit;
    routes.openai = openaiOk;
    const r = await ask();
    expect(r).toMatchObject({ source: 'ai', model: 'gpt-6.2-sol', data: { mood: '차분함', score: 7 } });
    expect(calls).toEqual(['anthropic', 'openai']);
    expect(env.getAiBlock('anthropic')?.reason).toBe('API 사용 한도 초과');
    calls.length = 0;
    await ask();
    expect(calls).toEqual(['openai']);
  });
  it('OpenAI 요청에 IDENTITY_POLICY·스키마(strict)·effort가 들어간다', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    let sent: Record<string, unknown> = {};
    routes.openai = (b) => ((sent = b), openaiOk(b));
    await ask({ system: '작업 지시', effort: 'low' });
    expect(String(sent.instructions)).toContain(ai.IDENTITY_POLICY);
    expect(String(sent.instructions)).toContain('작업 지시');
    expect(sent.reasoning).toEqual({ effort: 'low' });
    expect(sent.text).toMatchObject({ format: { type: 'json_schema', strict: true, schema: { required: ['mood', 'score'] } } });
  });
  it('스키마에 맞지 않는 OpenAI 응답은 mock으로 폴백', async () => {
    setEnv({ OPENAI_API_KEY: 'o' });
    routes.openai = (b) => ({ status: 200, json: { model: b.model, status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"mood":1}' }] }] } });
    const r = await ask();
    expect(r.source).toBe('mock');
    expect(r.data).toEqual(mock);
    expect(r.warning).toContain('스키마');
  });
  it('모두 실패하면 mock, fallbackOnError:false면 예외', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a-limit2', OPENAI_API_KEY: 'o' });
    routes.anthropic = anthropicLimit;
    routes.openai = () => ({ status: 401, json: { error: { message: 'bad key', code: 'invalid_api_key' } } });
    const r = await ask();
    expect(r).toMatchObject({ source: 'mock', model: 'gpt-6.2-sol' });
    expect(r.warning).toContain('API 키 인증 실패');
    expect(env.getCapabilities().ai).toBe(false);
    env.clearAiBlocks();
    await expect(ask({ fallbackOnError: false })).rejects.toBeInstanceOf(ai.OpenAiApiError);
  });
  it('CELEBER_AI_PROVIDER=anthropic이면 OpenAI를 부르지 않는다', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'a-limit3', OPENAI_API_KEY: 'o', CELEBER_AI_PROVIDER: 'anthropic' });
    routes.anthropic = anthropicLimit;
    const r = await ask();
    expect(r.source).toBe('mock');
    expect(calls).toEqual(['anthropic']);
  });
});

describe('isOpenAiStrictSchema', () => {
  it('선택 속성이 있으면 strict를 끈다', () => {
    expect(isStrict(z.object({ a: z.string(), b: z.array(z.object({ c: z.number() })) }))).toBe(true);
    expect(isStrict(z.object({ a: z.string(), b: z.string().optional() }))).toBe(false);
  });
});

function isStrict(s: z.ZodType) {
  return ai.isOpenAiStrictSchema(betaZodOutputFormat(s as never).schema);
}
