import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppHeader, PageContainer } from '@celeber/ui';
import { getFaceSession } from '@celeber/camera-face/server';
import { getReport } from '../../../src/server';
import { ReportClient } from './ReportClient';

export const metadata: Metadata = { title: 'CELEBER · 퍼스널컬러 리포트' };
export const dynamic = 'force-dynamic';

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getReport(id);
  if (!report) notFound();
  const faceExists = !!getFaceSession(report.faceSessionId);
  return (
    <>
      <AppHeader title="퍼스널컬러" backHref="/reports" />
      <PageContainer>
        <ReportClient
          report={report}
          warning={report.isMock ? 'AI 서술을 사용할 수 없어 측정값 기반 템플릿 서술을 표시합니다. 피부색 측정, 타입 판정, 드레이핑, 신뢰도는 실제 사진에서 계산했습니다.' : undefined}
          bodyAddHref={faceExists ? `/new?face=${encodeURIComponent(report.faceSessionId)}&step=body` : '/new'}
        />
      </PageContainer>
    </>
  );
}
