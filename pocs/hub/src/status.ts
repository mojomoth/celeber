/**
 * 각 PoC 앱의 /api/health를 서버에서 짧은 타임아웃으로 확인한다 (허브 화면·/api/status 공용).
 * 앱마다 AI 차단 상태(사용 한도 초과 → 10분 차단)가 프로세스별로 다르므로 capabilities도 앱 응답 그대로 쓴다.
 */
import 'server-only';
import type { Capabilities } from '@celeber/core/server/env';
import { POCS, type PocInfo } from './pocs';

export interface PocStatus {
  key: PocInfo['key'];
  port: number;
  running: boolean;
  ms: number | null;
  dbOk: boolean | null;
  dbPath: string | null;
  capabilities: Capabilities | null;
  error: string | null;
}

const PROBE_HOST = process.env.CELEBER_HUB_PROBE_HOST || '127.0.0.1';

export async function probePoc(p: PocInfo, timeoutMs = 1500): Promise<PocStatus> {
  const t0 = Date.now();
  try {
    const res = await fetch(`http://${PROBE_HOST}:${p.port}/api/health`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    const ms = Date.now() - t0;
    if (!res.ok) return { key: p.key, port: p.port, running: true, ms, dbOk: null, dbPath: null, capabilities: null, error: `HTTP ${res.status}` };
    const j = (await res.json()) as { db?: { ok?: boolean; path?: string }; capabilities?: Capabilities };
    return { key: p.key, port: p.port, running: true, ms, dbOk: j.db?.ok ?? null, dbPath: j.db?.path ?? null, capabilities: j.capabilities ?? null, error: null };
  } catch (e) {
    const name = (e as Error)?.name;
    return { key: p.key, port: p.port, running: false, ms: null, dbOk: null, dbPath: null, capabilities: null, error: name === 'TimeoutError' ? '응답 없음 (시간 초과)' : '실행 중이 아님' };
  }
}

export function probeAll(): Promise<PocStatus[]> {
  return Promise.all(POCS.map((p) => probePoc(p)));
}
