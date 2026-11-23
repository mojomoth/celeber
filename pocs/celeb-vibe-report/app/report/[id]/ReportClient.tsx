'use client';
import type { PersonalColorReport } from '@celeber/core/contracts';
import { Button } from '@celeber/ui';
import { ReportViewer } from '@celeber/personal-color-report/flow';

export function ReportClient({ report, warning, bodyAddHref }: { report: PersonalColorReport; warning?: string; bodyAddHref: string }) {
  return (
    <ReportViewer
      report={report}
      warning={warning}
      bodyAddHref={bodyAddHref}
      extraActions={
        <Button href={`/new?report=${encodeURIComponent(report.id)}`} block icon="search">
          이 리포트로 추구미 찾기
        </Button>
      }
    />
  );
}
