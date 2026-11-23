import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppHeader, PageContainer } from '@celeber/ui';
import { faceSessions } from '@celeber/core/server/db';
import { getGuide, getReport, getVibeAnalysis } from '../../../src/server';
import { reportBrief } from '../../../src/lib';
import { GuideClient } from './GuideClient';

export const metadata: Metadata = { title: 'CELEBER · 추구미 가이드' };
export const dynamic = 'force-dynamic';

function safe<T>(fn: () => T | null): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guide = getGuide(id);
  if (!guide) notFound();
  const vibe = safe(() => getVibeAnalysis(guide.vibeAnalysisId));
  const report = safe(() => getReport(guide.reportId));
  const faceExists = report ? !!safe(() => faceSessions.get(report.faceSessionId)) : false;
  return (
    <>
      <AppHeader title="추구미" backHref="/guides" />
      <PageContainer>
        <GuideClient
          guide={guide}
          vibe={vibe}
          myReport={report ? reportBrief(report) : null}
          warning={guide.isMock ? 'AI 서술을 사용할 수 없어 측정 계산과 규칙 서술로 만들었습니다. 색 치환·갭·팔레트 매핑은 실제 측정값으로 계산했습니다.' : undefined}
          reportHref={report ? `/report/${encodeURIComponent(report.id)}` : undefined}
          bodyAddHref={report && faceExists ? `/report/new?face=${encodeURIComponent(report.faceSessionId)}&step=body` : '/report/new'}
          newHref={report ? `/new?report=${encodeURIComponent(guide.reportId)}` : '/new'}
        />
      </PageContainer>
    </>
  );
}
