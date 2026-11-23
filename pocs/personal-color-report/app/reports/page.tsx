import type { Metadata } from 'next';
import { AppHeader, Button, PageContainer } from '@celeber/ui';
import { ReportList } from '../../src/components';
import { listReports } from '../../src/server';
import { ResetReports } from '../_components/ResetReports';

export const metadata: Metadata = { title: 'CELEBER · 내 퍼스널컬러 리포트' };
export const dynamic = 'force-dynamic';

export default function ReportsPage() {
  const reports = listReports(100);
  return (
    <>
      <AppHeader title="내 리포트" backHref="/" />
      <PageContainer>
        <div className="cb-stack">
          <h1 className="cb-screen-title">내 퍼스널컬러 리포트</h1>
          <ReportList reports={reports} emptyAction={<Button href="/new" icon="camera">리포트 만들기</Button>} />
          {reports.length ? (
            <>
              <Button href="/new" block variant="secondary" icon="camera">
                새 리포트 만들기
              </Button>
              <ResetReports count={reports.length} />
            </>
          ) : null}
        </div>
      </PageContainer>
    </>
  );
}
