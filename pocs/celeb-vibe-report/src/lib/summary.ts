/**
 * 목록 요약과 화면 보조 함수 (순수).
 */
import type { PersonalColorReport, PersonalColorReportSummary, VibeGuide } from '@celeber/core/contracts';
import { getToneProfile } from '@celeber/core/personal-color';
import { paletteForTone, paletteFromReport } from '@celeber/personal-color-report/lib';
import type { GuideSummary, MyReportBrief } from './types';

export function summarizeGuide(g: VibeGuide): GuideSummary {
  const celeb: string[] = [];
  const mine: string[] = [];
  for (const m of g.paletteMapping) {
    if (!celeb.includes(m.celeb.hex)) celeb.push(m.celeb.hex);
    if (!mine.includes(m.mine.hex)) mine.push(m.mine.hex);
  }
  return {
    id: g.id,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    celebName: g.celebName,
    lookName: g.lookName,
    thumbnail: g.thumbnail,
    saved: g.saved,
    isMock: g.isMock,
    source: g.source,
    reportId: g.reportId,
    vibeAnalysisId: g.vibeAnalysisId,
    myColors: mine.slice(0, 5),
    celebColors: celeb.slice(0, 5),
  };
}

export function reportBrief(r: PersonalColorReport): MyReportBrief {
  const p = getToneProfile(r.type.tone);
  const pal = paletteFromReport(r);
  return {
    id: r.id,
    tone: r.type.tone,
    nameKo: r.type.nameKo,
    nameEn: r.type.nameEn,
    accentHex: r.type.accentHex || p.accentHex,
    createdAt: r.createdAt,
    thumbnail: r.photos.front,
    best: pal.best.slice(0, 5).map((c) => ({ hex: c.hex, name: c.name })),
    isMock: r.isMock,
    hasBody: !!r.bodySessionId,
  };
}

/** 목록 요약(전체 리포트 없이)으로 만든 카드 데이터 — 색은 톤 팔레트 기준 */
export function briefFromSummary(r: PersonalColorReportSummary): MyReportBrief {
  const p = getToneProfile(r.tone);
  return {
    id: r.id,
    tone: r.tone,
    nameKo: r.nameKo,
    nameEn: p.nameEn,
    accentHex: p.accentHex,
    createdAt: r.createdAt,
    thumbnail: r.thumbnail,
    best: paletteForTone(r.tone).best.slice(0, 5).map((c) => ({ hex: c.hex, name: c.name })),
    isMock: r.isMock,
    hasBody: false,
  };
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** 저장 목록 정렬: 저장한 것 먼저, 그다음 최근 수정 순 */
export function sortGuides(items: GuideSummary[]): GuideSummary[] {
  return [...items].sort((a, b) => Number(b.saved) - Number(a.saved) || b.updatedAt.localeCompare(a.updatedAt));
}
