'use client';
import { useRouter } from 'next/navigation';
import type { PersonalColorReport } from '@celeber/core/contracts';
import { Button } from '@celeber/ui';
import { ReportViewer } from '../../../src/flow';

export function ReportClient({ report, warning, bodyAddHref }: { report: PersonalColorReport; warning?: string; bodyAddHref: string }) {
  const router = useRouter();
  return (
    <ReportViewer
      report={report}
      warning={warning}
      bodyAddHref={bodyAddHref}
      onDeleted={() => router.push('/reports')}
      extraActions={
        <Button href={`/new?face=${encodeURIComponent(report.faceSessionId)}`} variant="secondary" block icon="refresh">
          같은 얼굴로 다시 만들기
        </Button>
      }
    />
  );
}
