import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { getEnv } from './env';

interface BrowserDataScope {
  directory: string;
  active: boolean;
  db?: DatabaseSync;
}

// Next.js 번들과 개발 중 모듈 교체에서도 한 요청의 범위를 공유한다.
const G = globalThis as typeof globalThis & { __celeberBrowserData?: AsyncLocalStorage<BrowserDataScope> };
const storage = (G.__celeberBrowserData ??= new AsyncLocalStorage<BrowserDataScope>());

export function getBrowserDataScope(): BrowserDataScope | undefined {
  const scope = storage.getStore();
  if (scope && !scope.active) throw new Error('이미 닫힌 브라우저 저장소입니다.');
  return scope;
}

/** 검증이 끝난 세션 ID로 요청 안의 SQLite와 업로드 저장소를 선택한다. */
export async function withBrowserDataScope<T>(sessionId: string, callback: () => T | Promise<T>): Promise<T> {
  if (!/^[A-Za-z0-9_-]{22,128}$/.test(sessionId)) throw new Error('잘못된 브라우저 세션입니다.');
  const scopeName = createHash('sha256').update(sessionId).digest('hex');
  const directory = path.resolve(getEnv().dataDir, 'browser-sessions', scopeName);
  const enclosing = getBrowserDataScope();
  if (enclosing) {
    if (enclosing.directory !== directory) throw new Error('요청 중 브라우저 저장소를 바꿀 수 없습니다.');
    return callback();
  }

  const scope: BrowserDataScope = { directory, active: true };
  return storage.run(scope, async () => {
    try {
      return await callback();
    } finally {
      scope.active = false;
      scope.db?.close();
    }
  });
}
