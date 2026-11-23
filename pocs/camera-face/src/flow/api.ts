'use client';
/** camera-face API 호출 (apiBase + /api/face/*) */
import type { AnalyzeRequest, AnalyzeResponse, EnvironmentRequest, EnvironmentResponse } from '../lib/api';
import { errorMessage } from './vision';

async function postJson<T>(url: string, body: unknown, fallback: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error(`${fallback} (네트워크 오류)`);
  }
  if (!res.ok) throw new Error(await errorMessage(res, fallback));
  return (await res.json()) as T;
}

export function postEnvironment(apiBase: string, body: EnvironmentRequest): Promise<EnvironmentResponse> {
  return postJson(`${apiBase}/api/face/environment`, body, '환경 분석에 실패했습니다.');
}

export function postAnalyze(apiBase: string, body: AnalyzeRequest): Promise<AnalyzeResponse> {
  return postJson(`${apiBase}/api/face/analyze`, body, '얼굴 분석에 실패했습니다.');
}
