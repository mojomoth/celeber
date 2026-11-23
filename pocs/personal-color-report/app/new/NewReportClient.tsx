'use client';
import { useRouter } from 'next/navigation';
import { PersonalColorReportFlow } from '../../src/flow';

export function NewReportClient({ faceSessionId, step }: { faceSessionId?: string; step: 'choose' | 'capture' | 'body' }) {
  const router = useRouter();
  return (
    <PersonalColorReportFlow
      initialFaceSessionId={faceSessionId}
      initialStep={step}
      onCancel={() => router.push('/')}
      onComplete={({ report }) => router.push(`/reports/${report.id}`)}
    />
  );
}
