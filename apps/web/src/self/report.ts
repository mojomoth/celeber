import type { PersonalColorReport } from '@celeber/core/contracts';
import { readCurrent, writeCurrent, type CurrentAnalysis } from '../current';
import { fetchSelfJson, MissingAnalysis, postOptions, SelfRequestError } from './api';

const inFlight = new Map<string, Promise<PersonalColorReport>>();

export function getReportById(reportId: string): Promise<PersonalColorReport> {
  return fetchSelfJson<PersonalColorReport>(`/api/report/reports/${encodeURIComponent(reportId)}`);
}

async function loadReport(current: CurrentAnalysis): Promise<PersonalColorReport> {
  if (current.reportId) {
    try {
      return await getReportById(current.reportId);
    } catch (error) {
      if (!(error instanceof SelfRequestError && error.status === 404)) throw error;
    }
  }
  try {
    const { report } = await fetchSelfJson<{ report: PersonalColorReport }>(
      '/api/report/generate',
      postOptions({ faceSessionId: current.faceSessionId, bodySessionId: current.bodySessionId }),
    );
    const latest = readCurrent();
    if (latest?.faceSessionId === current.faceSessionId && latest.bodySessionId === current.bodySessionId) {
      writeCurrent({ ...current, reportId: report.id });
    }
    return report;
  } catch (error) {
    if (error instanceof SelfRequestError && error.code === 'face_not_found') throw new MissingAnalysis();
    throw error;
  }
}

export function ensureCurrentReport(): Promise<PersonalColorReport> {
  const current = readCurrent();
  if (!current) return Promise.reject(new MissingAnalysis());
  const key = JSON.stringify(current);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = loadReport(current).finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}
