/**
 * 라운드 2 프로브: 실제 Node fetch(undici)를 로컬 무응답/본문 정지 서버로 돌려 마감 signal이 끊는지, 화면 문구가 무엇인지 확인.
 * 외부 호출 없음. 공급자 URL만 127.0.0.1 임의 포트로 바꾼다.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const realFetch = globalThis.fetch;
let base = '';
const server = http.createServer((req, res) => {
  if (req.url?.includes('stall')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"id":');
  }
  // hang: 아무 응답도 하지 않음
});
let mode = 'hang';
vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const id = url.includes('anthropic.com') ? 'anthropic' : 'openai';
  if (input instanceof Request) return realFetch(new Request(`${base}/${id}/${mode}`, input), init);
  return realFetch(`${base}/${id}/${mode}`, init);
});
const env = await import('../../../../pocs/core/src/server/env');
const ai = await import('../../../../pocs/core/src/server/ai');
const KEYS = ['CELEBER_FORCE_MOCK', 'CELEBER_AI_PROVIDER', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
  vi.unstubAllGlobals();
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
});

describe('실제 fetch + 마감 signal', () => {
  it.each([
    ['openai', 'hang'],
    ['openai', 'stall'],
    ['anthropic', 'hang'],
    ['anthropic', 'stall'],
  ])('%s %s', async (provider, m) => {
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', CELEBER_AI_PROVIDER: provider });
    env.clearAiBlocks();
    mode = m;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t0 = Date.now();
    let done = false;
    const p = ai.callVisionStructured({ schema: z.object({ m: z.string() }), mock: { m: 'mock' }, prompt: 't', label: 'real' }).then((r) => ((done = true), r));
    // 연결이 먼저 맺어지도록 실제 시간을 조금 준다
    for (let i = 0; i < 2000 && !done; i++) {
      await new Promise((r) => setImmediate(r));
      await vi.advanceTimersByTimeAsync(i < 20 ? 0 : 1000);
      if (i < 20) await new Promise((r) => vi.getRealSystemTime() && setImmediate(r));
    }
    const sec = (Date.now() - t0) / 1000;
    vi.useRealTimers();
    const r = done ? await p : null;
    process.stdout.write(`R2REAL ${provider} ${m} | settled ${done} | sec ${sec} | ${r?.source} | ${r?.warning}\n`);
    expect(done).toBe(true);
  });
});
