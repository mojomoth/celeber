import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { setImmediate } from 'node:timers/promises';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dataDir, getDb, kvGet, kvSet, withBrowserDataScope } from '../src/server/db';
import { deleteUpload, saveUpload, serveUpload } from '../src/server/uploads';

const sessionA = 'browser-session-test-AAAAAAAA';
const sessionB = 'browser-session-test-BBBBBBBB';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'celeber-browser-data-'));

beforeAll(() => vi.stubEnv('CELEBER_DATA_DIR', directory));
afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('브라우저 저장소', () => {
  it('동시에 요청한 두 브라우저와 기존 저장소의 레코드를 분리한다', async () => {
    kvSet('record', 'legacy');
    const results = await Promise.all(
      [sessionA, sessionB].map((id) => withBrowserDataScope(id, async () => {
        expect(kvGet('record')).toBeNull();
        kvSet('record', id);
        await setImmediate();
        return { value: kvGet('record'), path: dataDir() };
      })),
    );
    expect(results.map(({ value }) => value)).toEqual([sessionA, sessionB]);
    expect(results[0].path).not.toBe(results[1].path);
    expect(path.relative(directory, results[0].path)).toMatch(/^browser-sessions[/\\][a-f0-9]{64}$/);
    expect(results[0].path).not.toContain(sessionA);
    expect(kvGet('record')).toBe('legacy');
  });

  it('다른 브라우저에서 사진 주소를 알아도 조회하거나 삭제할 수 없다', async () => {
    const png = await sharp({ create: { width: 40, height: 60, channels: 3, background: '#E3BBA6' } }).png().toBuffer();
    const first = await withBrowserDataScope(sessionA, () => saveUpload(png, { kind: 'face-front' }));
    await withBrowserDataScope(sessionB, async () => {
      expect(serveUpload(first.id).status).toBe(404);
      expect(deleteUpload(first.id)).toBe(false);
      const second = await saveUpload(png, { kind: 'face-front' });
      expect(second.id).not.toBe(first.id);
      expect(serveUpload(second.id).status).toBe(200);
    });
    expect(await withBrowserDataScope(sessionA, () => serveUpload(first.id).status)).toBe(200);
    expect(serveUpload(first.id).status).toBe(404);
  });

  it('같은 브라우저의 중첩 처리는 연결을 공유하고 요청 종료 후 연결을 닫는다', async () => {
    let connection: DatabaseSync | undefined;
    await expect(withBrowserDataScope(sessionA, async () => {
      connection = getDb();
      kvSet('reopen', 'saved');
      expect(await withBrowserDataScope(sessionA, () => getDb())).toBe(connection);
      await expect(withBrowserDataScope(sessionB, () => getDb())).rejects.toThrow('요청 중 브라우저 저장소를 바꿀 수 없습니다.');
      throw new Error('처리 실패');
    })).rejects.toThrow('처리 실패');
    expect(connection).toBeDefined();
    expect(() => connection?.prepare('SELECT 1')).toThrow();
    expect(await withBrowserDataScope(sessionA, () => kvGet('reopen'))).toBe('saved');
  });

  it('브라우저 세션 ID에서 경로 형태를 거부한다', async () => {
    await expect(withBrowserDataScope('../unscoped/celeber.db', () => getDb())).rejects.toThrow('잘못된 브라우저 세션');
  });
});
