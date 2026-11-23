'use client';
import { useRouter } from 'next/navigation';
import { PersonalColorReportFlow } from '@celeber/personal-color-report/flow';

export function ReportNewClient({ faceSessionId, step }: { faceSessionId?: string; step: 'choose' | 'capture' | 'body' }) {
  const router = useRouter();
  return (
    <PersonalColorReportFlow
      initialFaceSessionId={faceSessionId}
      initialStep={step}
      onCancel={() => router.push('/')}
      onComplete={({ report }) => router.push(`/new?report=${encodeURIComponent(report.id)}`)}
    />
  );
}
