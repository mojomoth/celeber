export type CurrentAnalysis = { faceSessionId: string; bodySessionId?: string; reportId?: string };

const currentKey = 'celeber.current.v1';
let currentInMemory: CurrentAnalysis | null = null;

export function readCurrent(): CurrentAnalysis | null {
  if (typeof window === 'undefined') return null;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(currentKey) ?? 'null');
    if (!value || typeof value !== 'object' || !('faceSessionId' in value) || typeof value.faceSessionId !== 'string') return null;
    return {
      faceSessionId: value.faceSessionId,
      bodySessionId: 'bodySessionId' in value && typeof value.bodySessionId === 'string' ? value.bodySessionId : undefined,
      reportId: 'reportId' in value && typeof value.reportId === 'string' ? value.reportId : undefined,
    };
  } catch {
    return currentInMemory;
  }
}

export function writeCurrent(current: CurrentAnalysis) {
  currentInMemory = current;
  try {
    window.localStorage.setItem(currentKey, JSON.stringify(current));
  } catch {
    // 저장소를 막은 브라우저에서도 현재 탭에서는 흐름을 이어간다.
  }
}

export function clearCurrent() {
  currentInMemory = null;
  try {
    window.localStorage.removeItem(currentKey);
  } catch {
    // 저장소를 막은 브라우저에서는 현재 탭 상태만 지운다.
  }
}
