import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppHeader, PageContainer } from '@celeber/ui';
import { faceSessions } from '@celeber/core/server/db';
import { getReport } from '../../../src/server';
import { ReportClient } from './ReportClient';

export const metadata: Metadata = { title: 'CELEBER · 내 퍼스널컬러' };
export const dynamic = 'force-dynamic';

/** 내 퍼스널컬러 다시보기 (personal-color-report ReportViewer 재사용). 삭제는 personal-color-report 앱에서만. */
export default async function MyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getReport(id);
  if (!report) notFound();
  let faceExists = false;
  try {
    faceExists = !!faceSessions.get(report.faceSessionId);
  } catch {
    faceExists = false;
  }
  return (
    <>
      <AppHeader title="내 퍼스널컬러" backHref="/" />
      <PageContainer>
        <ReportClient
          report={report}
          warning={report.isMock ? 'AI 서술을 사용할 수 없어 측정값 기반 템플릿 서술을 표시합니다. 피부색 측정, 타입 판정, 드레이핑, 신뢰도는 실제 사진에서 계산했습니다.' : undefined}
          bodyAddHref={faceExists ? `/report/new?face=${encodeURIComponent(report.faceSessionId)}&step=body` : '/report/new'}
        />
      </PageContainer>
    </>
  );
}
